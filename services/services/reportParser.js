const ExcelJS = require('exceljs');

// ─── Helper ───────────────────────────────────────────────────────────────────

function safeNum(val) {
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

function findRowByLabel(sheet, label) {
  let found = null;
  sheet.eachRow((row, rowNum) => {
    row.eachCell((cell) => {
      if (typeof cell.value === 'string' && cell.value.trim().toLowerCase().includes(label.toLowerCase())) {
        found = row;
      }
    });
  });
  return found;
}

function getValueByLabel(sheet, label, colOffset = 1) {
  let result = null;
  sheet.eachRow((row) => {
    row.eachCell((cell, colNumber) => {
      if (typeof cell.value === 'string' && cell.value.trim().toLowerCase().includes(label.toLowerCase())) {
        const targetCell = row.getCell(colNumber + colOffset);
        result = targetCell?.value;
      }
    });
  });
  return safeNum(result);
}

// ─── Parser 1: Water Consumption (master sheet) ───────────────────────────────

async function parseWaterConsumption(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.getWorksheet('master') || workbook.worksheets[0];
  if (!sheet) throw new Error('master sheet not found');

  const data = {
    date: new Date(),
    grConsumption: {},
    totalGrConsumption: null,
    tankLevels: { ST1: null, ST2: null, DT1: null, DT2: null },
    swProduction: null,
    swConsumption: null,
    dmProduction: null,
    dmConsumption: null,
  };

  const labelMap = {
    'GR-1 CONSUMPT':       (v) => { data.grConsumption['GR1'] = v; },
    'GR-2 CONSUMPT':       (v) => { data.grConsumption['GR2'] = v; },
    'GR-3 CONSUMPT':       (v) => { data.grConsumption['GR3'] = v; },
    'GR-4 CONSUMPT':       (v) => { data.grConsumption['GR4'] = v; },
    'GR-5 CONSUMPT':       (v) => { data.grConsumption['GR5'] = v; },
    'GR-6 CONSUMPT':       (v) => { data.grConsumption['GR6'] = v; },
    'Total GR CONSUMPT':   (v) => { data.totalGrConsumption = v; },
    'ST-1 level':          (v) => { data.tankLevels.ST1 = v; },
    'ST-2 level':          (v) => { data.tankLevels.ST2 = v; },
    'DT-1 level':          (v) => { data.tankLevels.DT1 = v; },
    'DT-2 level':          (v) => { data.tankLevels.DT2 = v; },
    'Total SW PROD':       (v) => { data.swProduction = v; },
    'Total SW CONSUMPT':   (v) => { data.swConsumption = v; },
    'Total DM PROD':       (v) => { data.dmProduction = v; },
    'Total DM CONSUMPT':   (v) => { data.dmConsumption = v; },
  };

  // Find today's column (day of month = column index offset from col B)
  const today = new Date().getDate();

  sheet.eachRow((row) => {
    const label = row.getCell(1).value;
    if (!label || typeof label !== 'string') return;
    const trimmed = label.trim();
    for (const [key, setter] of Object.entries(labelMap)) {
      if (trimmed.toLowerCase().includes(key.toLowerCase())) {
        // Col B = day 1, Col C = day 2, etc.
        const dayCell = row.getCell(today + 1);
        const val = safeNum(dayCell?.value);
        if (val !== null) setter(val);
      }
    }
  });

  return data;
}

// ─── Parser 2: Energy Report ──────────────────────────────────────────────────

async function parseEnergyReport(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.getWorksheet('LCam') || workbook.worksheets[0];
  if (!sheet) throw new Error('LCam sheet not found');

  const hourlyData = [];
  let totalEnergy = 0;
  let maxAvailability = 0;
  let contractedCapacity = null;
  let reportDate = null;

  sheet.eachRow((row, rowNum) => {
    const s = String(row.getCell(1).value || '').trim();
    // Header rows have [N] pattern
    if (!s.match(/^\[\d+\]$/)) return;

    const date      = row.getCell(2).value;
    const hour      = row.getCell(5).value;
    const contracted = safeNum(row.getCell(6).value);
    const declared  = safeNum(row.getCell(7).value);
    const actual    = safeNum(row.getCell(8).value);
    const available = safeNum(row.getCell(11).value);

    if (date && !reportDate) reportDate = new Date(date);
    if (contracted && !contractedCapacity) contractedCapacity = contracted;
    if (actual !== null) totalEnergy += actual;
    if (available && available > maxAvailability) maxAvailability = available;

    hourlyData.push({ hour, actualMWh: actual, availableMW: declared });
  });

  return {
    date: reportDate || new Date(),
    contractedCapacityMW: contractedCapacity,
    totalActualEnergyMWh: totalEnergy,
    peakAvailabilityMW: maxAvailability,
    hourlyData,
  };
}

// ─── Parser 3: RO + HRSG Chemistry ───────────────────────────────────────────

async function parseROHRSGReport(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const result = { date: new Date(), ro: {}, hrsg: {} };

  // ── RO Sheet ──
  const roSheet = workbook.getWorksheet('RO Report') || workbook.getWorksheet('RO');
  if (roSheet) {
    const sampling = {};
    let inData = false;
    roSheet.eachRow((row) => {
      const point = String(row.getCell(1).value || '').trim();
      if (!point) return;
      const pH   = safeNum(row.getCell(2).value);
      const sc   = safeNum(row.getCell(3).value);
      const turb = safeNum(row.getCell(4).value);
      const cl   = safeNum(row.getCell(5).value);
      const orpOrSi = safeNum(row.getCell(6).value);
      if (pH !== null || sc !== null) {
        sampling[point] = { pH, sc, turbidity: turb, cl, orpOrSi };
      }
    });
    result.ro = {
      dafTank:   sampling['DAF']       || null,
      dmfTank:   sampling['DMF Tank']  || null,
      swroTank:  sampling['SWRO Tank'] || null,
      deminTank: sampling['Demin Tank']|| null,
      swTanks:   sampling['SW Tanks']  || null,
    };
  }

  // ── HRSG Sheet ──
  const hrsgSheet = workbook.getWorksheet('HRSG') || workbook.getWorksheet('HRSG Report');
  if (hrsgSheet) {
    const units = {};
    hrsgSheet.eachRow((row) => {
      const unitNo = String(row.getCell(1).value || '').trim();
      if (!unitNo.match(/^\d{2}$/)) return;
      const pH = safeNum(row.getCell(2).value);
      const sc = safeNum(row.getCell(3).value);
      const cc = safeNum(row.getCell(4).value);
      const doVal = safeNum(row.getCell(5).value);
      if (pH !== null || sc !== null) {
        units[`unit${unitNo}`] = { pH, sc, cc, dissolvedOxygen: doVal };
      }
    });
    result.hrsg = { condensate: units };
  }

  return result;
}

// ─── Parser 4: Daily Operation Report ────────────────────────────────────────

async function parseDailyOperationReport(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('No sheet found in Daily Operation Report');

  const result = {
    date: new Date(),
    totalPlantLoadMW: null,
    groups: {},
  };

  sheet.eachRow((row) => {
    row.eachCell((cell, colNum) => {
      const val = String(cell.value || '').trim();
      if (val.toUpperCase().includes('TOTAL PLANT LOAD IN MW')) {
        // Value is usually a few columns to the right
        for (let c = colNum + 1; c <= colNum + 10; c++) {
          const candidate = safeNum(row.getCell(c).value);
          if (candidate !== null && candidate > 100) {
            result.totalPlantLoadMW = candidate;
            break;
          }
        }
      }
      // GT/ST load readings — label like "GT-11", value next cell
      if (val.match(/^GT-\d{2}$/) || val.match(/^ST-\d{1,2}$/)) {
        const loadCell = safeNum(row.getCell(colNum + 1).value);
        if (loadCell !== null) result.groups[val] = loadCell;
      }
    });
  });

  return result;
}

// ─── Parser 5: GT Filter DP ──────────────────────────────────────────────────

async function parseGtFilterDP(buffer, type = 'air') {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('No sheet found in GT Filter DP');

  const result = { date: new Date(), type, units: {} };

  sheet.eachRow((row) => {
    const label = String(row.getCell(2).value || '').trim();
    if (!label.match(/^GT-\d{2}$/)) return;

    if (type === 'air') {
      result.units[label] = {
        mw:          safeNum(row.getCell(3).value),
        pulseAirPr:  safeNum(row.getCell(4).value),
        p1c:         safeNum(row.getCell(5).value),
        dpDCS:       safeNum(row.getCell(6).value),
        dpLocal:     safeNum(row.getCell(7).value),
        instAirPr:   safeNum(row.getCell(9).value),
        remarks:     String(row.getCell(11).value || '').trim() || null,
      };
    } else {
      result.units[label] = {
        load:          safeNum(row.getCell(3).value),
        bpSpread:      safeNum(row.getCell(4).value),
        fgSepBefore:   safeNum(row.getCell(5).value),
        fgSepAfter:    safeNum(row.getCell(6).value),
        stageGasPr:    safeNum(row.getCell(7).value),
        dpDCS:         safeNum(row.getCell(8).value),
        inService:     String(row.getCell(9).value || '').trim() || null,
        remarks:       String(row.getCell(13).value || '').trim() || null,
      };
    }
  });

  return result;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  parseWaterConsumption,
  parseEnergyReport,
  parseROHRSGReport,
  parseDailyOperationReport,
  parseGtFilterDP,
};