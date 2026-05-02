const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const fs = require('fs');
const RoReport = require('./models/RoReport');

/** Return numeric value or null for dash / blank cells */
function num(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s === "" || s === "-") return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

/** Trim a cell value to string or null */
function str(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" || s === "NaN" ? null : s;
}

/** Avoid re-adding an activity description we already captured */
function parts_already_captured(activities, text) {
  return activities.some(
    (a) => a.description && a.description.includes(text)
  );
}

async function parseReport(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const ws = workbook.getWorksheet(1) || workbook.worksheets[0];
  const sheetName = ws.name.toUpperCase();
  const grid = [];
  ws.eachRow({ includeEmpty: true }, (row, rowNum) => {
    grid[rowNum] = [];
    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      let val = cell.value;
      if (val && typeof val === 'object') {
        if (val.result !== undefined) val = val.result;
        else if (val.richText) val = val.richText.map(t => t.text).join("");
      }
      grid[rowNum][colNum] = str(val);
    });
  });

  const cell = (r, c) => (grid[r] && grid[r][c] !== undefined ? grid[r][c] : null);

  if (sheetName.includes("RO DAILY REPORT")) {
    const rawDate = cell(1, 10);
    const shift   = cell(2, 10);

    if (!rawDate) throw new Error("Cannot find report date in row 1 col J.");

    const reportDate = new Date(rawDate);
    if (isNaN(reportDate.getTime())) {
      throw new Error(`Unrecognised date format: "${rawDate}"`);
    }

    const dmfUnits = [];
    for (let r = 5; r <= 10; r++) {
      const unitNo = num(cell(r, 2));
      if (unitNo === null) continue;
      dmfUnits.push({
        unitNumber:  unitNo,
        status:      cell(r, 3),
        inletFlow:   num(cell(r, 4)),
        dp:          num(cell(r, 5)),
      });
    }

    const cfUnits = [];
    for (let r = 12; r <= 14; r++) {
      const unitNo = num(cell(r, 2));
      if (unitNo === null) continue;
      cfUnits.push({
        unitNumber:  unitNo,
        status:      cell(r, 3),
        dp:          num(cell(r, 4)),
        turbidity:   num(cell(r, 5)),
      });
    }

    const equipment = [];
    for (let r = 5; r <= 14; r++) {
      const name = cell(r, 6);
      if (!name) continue;
      equipment.push({
        name:         name,
        inService:    num(cell(r, 7)),
        standBy:      num(cell(r, 8)),
        outOfService: num(cell(r, 9)),
      });
    }

    const pass1Units = [];
    for (let r = 17; r <= 20; r++) {
      const unitNo = num(cell(r, 2));
      if (unitNo === null) continue;
      pass1Units.push({
        unitNumber:    unitNo,
        status:        cell(r, 3),
        inletPressure: num(cell(r, 4)),
        dp:            num(cell(r, 5)),
      });
    }

    const pass2Units = [];
    for (let r = 21; r <= 24; r++) {
      const unitNo = num(cell(r, 2));
      if (unitNo === null) continue;
      pass2Units.push({
        unitNumber:    unitNo,
        status:        cell(r, 3),
        inletPressure: num(cell(r, 4)),
        dp:            num(cell(r, 5)),
      });
    }

    const mbUnits = [];
    for (let r = 26; r <= 29; r++) {
      const unitNo = num(cell(r, 2));
      if (unitNo === null) continue;
      mbUnits.push({
        unitNumber:    unitNo,
        status:        cell(r, 3),
        dp:            num(cell(r, 4)),
        inletFlow:     num(cell(r, 5)),
      });
    }

    const swProdM3hr = num(cell(32, 5));
    const dmProdM3hr = num(cell(35, 5));
    const tanks = {
      swAMm:           num(cell(31, 1)),
      swBMm:           num(cell(31, 2)),
      dmAMm:           num(cell(31, 3)),
      dmBMm:           num(cell(31, 4)),
      swAM3:           num(cell(33, 1)),
      swBM3:           num(cell(33, 2)),
      dmAM3:           num(cell(33, 3)),
      dmBM3:           num(cell(33, 4)),
      swProductionM3hr: swProdM3hr,
      dmProductionM3hr: dmProdM3hr,
      swProduction24h:  num(cell(35, 1)),
      swConsumption24h: num(cell(35, 2)),
      dmProduction24h:  num(cell(35, 3)),
      dmConsumption24h: num(cell(35, 4)),
    };

    const activities = [];
    const timePattern = /^\d{1,2}:\d{2}(AM|PM)$/i;

    for (let r = 15; r <= ws.rowCount; r++) {
      const possibleTime = cell(r, 7);
      if (possibleTime && timePattern.test(possibleTime.replace(/\s/g, ""))) {
        const parts = [cell(r, 8), cell(r, 9), cell(r, 10), cell(r, 11)]
          .filter(Boolean)
          .filter((v, i, arr) => arr.indexOf(v) === i);
        activities.push({
          time:        possibleTime,
          description: parts.join(" | ") || null,
        });
      } else if (possibleTime && possibleTime.trim()) {
        activities.push({
          time:        null,
          description: possibleTime,
        });
      }
    }

    return {
      type: 'RO',
      data: {
        reportDate,
        shift,
        dmfUnits,
        cfUnits,
        equipment,
        pass1Units,
        pass2Units,
        mbUnits,
        tanks,
        activities,
      }
    };
  } else if (sheetName.includes("HRSG")) {
    const rawDate = cell(1, 18); // Date value is at Col 18 in my dump (0-based 18 = Col 19 if indexed from 1, wait)
    // My dump: Row 1: [null, ..., "Date:", "2026-04-18..."]
    // Index 17 is "Date:", Index 18 is value. So Col 18 is value.
    if (!rawDate) throw new Error("Cannot find report date in row 1.");
    const reportDate = new Date(rawDate);
    
    // Basic HRSG parsing could be added here, but for now we at least get the date
    return {
      type: 'HRSG',
      data: {
        reportDate,
        raw: "HRSG report detected"
      }
    };
  }

  throw new Error(`Unsupported report type: ${sheetName}`);
}

async function run() {
  try {
    await mongoose.connect(process.env.COSMOS_CONNECTION_STRING || process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const chemReportsDir = path.join(__dirname, 'chem_reports');
    if (!fs.existsSync(chemReportsDir)) {
      console.error('Directory chem_reports not found');
      process.exit(1);
    }

    const files = fs.readdirSync(chemReportsDir).filter(f => f.endsWith('.xlsx'));
    console.log(`Found ${files.length} .xlsx files`);

    for (const file of files) {
      const filePath = path.join(chemReportsDir, file);
      console.log(`Processing: ${file}`);
      try {
        const result = await parseReport(filePath);
        
        if (result.type === 'RO') {
          await RoReport.findOneAndUpdate(
            { reportDate: result.data.reportDate, shift: result.data.shift },
            result.data,
            { upsert: true, new: true }
          );
          console.log(`✓ Imported RO: ${result.data.reportDate.toDateString()} - Shift ${result.data.shift}`);
        } else {
          console.log(`- Skipped ${result.type} report for now.`);
        }
      } catch (err) {
        console.error(`✗ Error processing ${file}: ${err.message}`);
      }
    }

    console.log('All files processed');
    process.exit(0);
  } catch (err) {
    console.error('Connection error:', err);
    process.exit(1);
  }
}

run();
