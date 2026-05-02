/**
 * ro_report_import.js
 *
 * Parses the "RO Daily Report" CSV (exported from Excel) using ExcelJS
 * and inserts the structured data into a PostgreSQL database.
 *
 * ── Schema (auto-created on first run) ─────────────────────────────────────
 *   ro_daily_reports          – one row per report (date + shift)
 *   ro_pretreatment_units     – DMF and CF filter units
 *   ro_equipment_availability – plant equipment in-service / standby counts
 *   ro_treatment_units        – 1st pass RO, 2nd pass RO, and MB units
 *   ro_tank_levels            – SW / DM tank levels and production figures
 *   ro_activity_log           – timestamped activity entries
 *
 * ── Usage ───────────────────────────────────────────────────────────────────
 *   npm install exceljs pg
 *   node ro_report_import.js <path-to-csv>
 *
 *   Environment variables (or edit DB_CONFIG below):
 *     PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD
 */

"use strict";

const path = require("path");
const ExcelJS = require("exceljs");
const { Pool } = require("pg");

// ── Database connection ──────────────────────────────────────────────────────

const DB_CONFIG = {
  host: process.env.PGHOST || "localhost",
  port: Number(process.env.PGPORT) || 5432,
  database: process.env.PGDATABASE || "water_treatment",
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD || "postgres",
};

const pool = new Pool(DB_CONFIG);

// ── Schema DDL ───────────────────────────────────────────────────────────────

const DDL = `
CREATE TABLE IF NOT EXISTS ro_daily_reports (
  id            SERIAL PRIMARY KEY,
  report_date   DATE        NOT NULL,
  shift         VARCHAR(10) NOT NULL,          -- e.g. "N" (Night), "D" (Day)
  imported_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (report_date, shift)
);

CREATE TABLE IF NOT EXISTS ro_pretreatment_units (
  id            SERIAL PRIMARY KEY,
  report_id     INT         NOT NULL REFERENCES ro_daily_reports(id) ON DELETE CASCADE,
  unit_type     VARCHAR(10) NOT NULL,          -- "DMF" or "CF"
  unit_number   INT         NOT NULL,
  status        VARCHAR(30),                   -- "In Service" | "Stand By"
  inlet_flow    NUMERIC(10,3),                 -- m3/h  (DMF only)
  dp_bar        NUMERIC(6,3),                  -- bar
  turbidity_ntu NUMERIC(8,3)                   -- NTU   (CF only)
);

CREATE TABLE IF NOT EXISTS ro_equipment_availability (
  id            SERIAL PRIMARY KEY,
  report_id     INT         NOT NULL REFERENCES ro_daily_reports(id) ON DELETE CASCADE,
  equipment     VARCHAR(60) NOT NULL,
  in_service    INT,
  stand_by      INT,
  out_of_service INT
);

CREATE TABLE IF NOT EXISTS ro_treatment_units (
  id            SERIAL PRIMARY KEY,
  report_id     INT         NOT NULL REFERENCES ro_daily_reports(id) ON DELETE CASCADE,
  pass_type     VARCHAR(20) NOT NULL,          -- "1st Pass RO" | "2nd Pass RO" | "MB"
  unit_number   INT         NOT NULL,
  status        VARCHAR(30),
  inlet_pressure NUMERIC(8,3),                 -- bar
  dp_bar        NUMERIC(6,3),
  inlet_flow    NUMERIC(10,3)                  -- m3/h (MB only)
);

CREATE TABLE IF NOT EXISTS ro_tank_levels (
  id                    SERIAL PRIMARY KEY,
  report_id             INT  NOT NULL REFERENCES ro_daily_reports(id) ON DELETE CASCADE,
  sw_a_mm               INT,                   -- Salt Water tank A level (mm)
  sw_b_mm               INT,                   -- Salt Water tank B level (mm)
  dm_a_mm               INT,                   -- De-min tank A level (mm)
  dm_b_mm               INT,                   -- De-min tank B level (mm)
  sw_a_m3               NUMERIC(12,2),         -- SW tank A volume (m3)
  sw_b_m3               NUMERIC(12,2),
  dm_a_m3               NUMERIC(12,2),
  dm_b_m3               NUMERIC(12,2),
  sw_production_m3hr    NUMERIC(10,2),         -- Instantaneous production
  dm_production_m3hr    NUMERIC(10,2),
  sw_production_24h     NUMERIC(12,2),         -- 24-hour totals
  sw_consumption_24h    NUMERIC(12,2),
  dm_production_24h     NUMERIC(12,2),
  dm_consumption_24h    NUMERIC(12,2)
);

CREATE TABLE IF NOT EXISTS ro_activity_log (
  id            SERIAL PRIMARY KEY,
  report_id     INT         NOT NULL REFERENCES ro_daily_reports(id) ON DELETE CASCADE,
  activity_time VARCHAR(20),                   -- kept as text; may be "00:00AM" etc.
  description   TEXT
);
`;

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// ── CSV → structured object ───────────────────────────────────────────────────

/**
 * Reads the CSV with ExcelJS and extracts all report sections.
 *
 * The report is a "print-layout" spreadsheet, not a normalised table.
 * Sections are identified by anchor text in column A (col index 1).
 *
 * Row index map (1-based, as ExcelJS uses):
 *   R1  : title row  –  col J = date, col K = date value
 *   R2  : shift row  –  col J = "Shift", col K = shift letter
 *   R3  : Pre-Treatment header
 *   R4  : DMF column headers
 *   R5-10: DMF unit rows   (col B = unit#, C = status, D = inlet flow, E = DP)
 *          RO Equipment availability in cols F-J (same rows)
 *   R11 : CF column headers
 *   R12-14: CF unit rows   (col B = unit#, C = status, D = DP, E = turbidity)
 *          RO Equipment continued in cols F-J
 *   R15 : "RO Treatment" section header
 *   R16 : 1st Pass RO header
 *   R17-20: 1st Pass RO unit rows
 *   R20 : 2nd Pass RO header
 *   R21-24: 2nd Pass RO unit rows
 *   R24 : De-Mineralization header
 *   R25 : MB header
 *   R26-29: MB unit rows
 *   R29 : Tanks header
 *   R30 : Tank level column headers (SW A mm, SW B mm, DM A mm, DM B mm)
 *   R31 : Tank level values (mm)
 *   R32 : Tank volume column headers (SW A m3, SW B m3, …)
 *   R33 : Tank volume values + SW production
 *   R34 : Production/Consumption column headers
 *   R35 : Production/Consumption values + DM production
 *
 * Activity log occupies col G onwards from R14 downward.
 */
async function parseReport(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.csv.readFile(filePath);

  // ExcelJS names the sheet "Sheet1" when reading CSV
  const ws = workbook.getWorksheet(1) || workbook.worksheets[0];

  // Build a simple 2-D array (1-based rows, 1-based cols) for easy access
  const grid = [];
  ws.eachRow((row, rowNum) => {
    grid[rowNum] = [];
    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      grid[rowNum][colNum] = str(cell.value);
    });
  });

  // Helper: get a cell value (returns null if out of bounds)
  const cell = (r, c) => (grid[r] && grid[r][c] !== undefined ? grid[r][c] : null);

  // ── Report metadata ──────────────────────────────────────────────────────
  // Row 1 cols J(10) = "Date …", col K(11) = date string e.g. "16-Apr-26"
  // Row 2 cols J(10) = "Shift",  col K(11) = shift letter e.g. "N"
  const rawDate = cell(1, 11); // "16-Apr-26"
  const shift   = cell(2, 11); // "N"

  if (!rawDate) throw new Error("Cannot find report date in row 1 col K.");

  // Parse "16-Apr-26" → JavaScript Date
  const reportDate = new Date(rawDate);
  if (isNaN(reportDate.getTime())) {
    throw new Error(`Unrecognised date format: "${rawDate}"`);
  }

  // ── Pre-Treatment: DMF units (rows 5-10, cols B-E) ──────────────────────
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

  // ── Pre-Treatment: CF units (rows 12-14, cols B-E) ──────────────────────
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

  // ── RO Equipment Availability (rows 5-14, cols F-J) ──────────────────────
  // Col F = equipment name, G = in service, H = standby, I = O/S, J = remarks
  const equipment = [];
  for (let r = 5; r <= 14; r++) {
    const name = cell(r, 6);
    if (!name) continue;
    equipment.push({
      equipment:    name,
      inService:    num(cell(r, 7)),
      standBy:      num(cell(r, 8)),
      outOfService: num(cell(r, 9)),
    });
  }

  // ── 1st Pass RO units (rows 17-20, cols B-E) ────────────────────────────
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

  // ── 2nd Pass RO units (rows 21-24, cols B-E) ────────────────────────────
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

  // ── Mixed Bed (De-min) units (rows 26-29, cols B-E) ─────────────────────
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

  // ── Tank levels ──────────────────────────────────────────────────────────
  // Row 31: mm levels   A=col1, B=col2, C=col3, D=col4
  // Row 32: m3 volumes  A=col1, B=col2, C=col3, D=col4   col5=SW production m3/hr
  // Row 33: 24h figures A=col1(sw prod), B=col2(sw cons), C(dm prod), D(dm cons), col5=DM production m3/hr
  const swProdM3hr = num(cell(31, 5));
  const dmProdM3hr = num(cell(33, 5));
  const tanks = {
    swAMm:           num(cell(31, 1)),
    swBMm:           num(cell(31, 2)),
    dmAMm:           num(cell(31, 3)),
    dmBMm:           num(cell(31, 4)),
    swAM3:           num(cell(32, 1)),
    swBM3:           num(cell(32, 2)),
    dmAM3:           num(cell(32, 3)),
    dmBM3:           num(cell(32, 4)),
    swProductionM3hr: swProdM3hr,
    dmProductionM3hr: dmProdM3hr,
    swProduction24h:  num(cell(35, 1)),
    swConsumption24h: num(cell(35, 2)),
    dmProduction24h:  num(cell(35, 3)),
    dmConsumption24h: num(cell(35, 4)),
  };

  // ── Activity log (rows 15+, cols G-K where not empty) ───────────────────
  // Time entries appear in col G or H looking for a time pattern
  const activities = [];
  const timePattern = /^\d{1,2}:\d{2}(AM|PM)$/i;

  for (let r = 15; r <= ws.rowCount; r++) {
    // Col G might hold a time label
    const possibleTime = cell(r, 7);
    if (possibleTime && timePattern.test(possibleTime.replace(/\s/g, ""))) {
      // Collect all non-null text from cols H-K as the activity description
      const parts = [cell(r, 8), cell(r, 9), cell(r, 10), cell(r, 11)]
        .filter(Boolean)
        .filter((v, i, arr) => arr.indexOf(v) === i); // deduplicate
      activities.push({
        time:        possibleTime,
        description: parts.join(" | ") || null,
      });
    } else if (possibleTime && possibleTime.trim()) {
      // Non-time activity notes (no timestamp)
      activities.push({
        time:        null,
        description: possibleTime,
      });
    }
    // Also scan cols H-K for activity entries that have no time prefix
    for (let c = 8; c <= 11; c++) {
      const v = cell(r, c);
      if (v && v.length > 5 && !parts_already_captured(activities, v)) {
        // Only add rows where there was no time key in this row
        if (!possibleTime || !timePattern.test(possibleTime.replace(/\s/g, ""))) {
          activities.push({ time: null, description: v });
        }
      }
    }
  }

  return {
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
  };
}

/** Avoid re-adding an activity description we already captured */
function parts_already_captured(activities, text) {
  return activities.some(
    (a) => a.description && a.description.includes(text)
  );
}

// ── Database operations ───────────────────────────────────────────────────────

async function ensureSchema(client) {
  await client.query(DDL);
}

async function insertReport(client, data) {
  const {
    reportDate, shift, dmfUnits, cfUnits, equipment,
    pass1Units, pass2Units, mbUnits, tanks, activities,
  } = data;

  // ── 1. Upsert the report header ──────────────────────────────────────────
  const reportRes = await client.query(
    `INSERT INTO ro_daily_reports (report_date, shift)
     VALUES ($1, $2)
     ON CONFLICT (report_date, shift) DO UPDATE SET imported_at = NOW()
     RETURNING id`,
    [reportDate, shift]
  );
  const reportId = reportRes.rows[0].id;
  console.log(`  ↳ Report ID: ${reportId}  (${reportDate.toDateString()}, Shift ${shift})`);

  // Clean up any existing child rows for this report before re-inserting
  await client.query("DELETE FROM ro_pretreatment_units     WHERE report_id = $1", [reportId]);
  await client.query("DELETE FROM ro_equipment_availability WHERE report_id = $1", [reportId]);
  await client.query("DELETE FROM ro_treatment_units        WHERE report_id = $1", [reportId]);
  await client.query("DELETE FROM ro_tank_levels            WHERE report_id = $1", [reportId]);
  await client.query("DELETE FROM ro_activity_log           WHERE report_id = $1", [reportId]);

  // ── 2. Pre-treatment units ───────────────────────────────────────────────
  for (const u of dmfUnits) {
    await client.query(
      `INSERT INTO ro_pretreatment_units
         (report_id, unit_type, unit_number, status, inlet_flow, dp_bar)
       VALUES ($1, 'DMF', $2, $3, $4, $5)`,
      [reportId, u.unitNumber, u.status, u.inletFlow, u.dp]
    );
  }
  for (const u of cfUnits) {
    await client.query(
      `INSERT INTO ro_pretreatment_units
         (report_id, unit_type, unit_number, status, dp_bar, turbidity_ntu)
       VALUES ($1, 'CF', $2, $3, $4, $5)`,
      [reportId, u.unitNumber, u.status, u.dp, u.turbidity]
    );
  }
  console.log(`  ↳ Inserted ${dmfUnits.length} DMF + ${cfUnits.length} CF pre-treatment units`);

  // ── 3. Equipment availability ────────────────────────────────────────────
  for (const e of equipment) {
    await client.query(
      `INSERT INTO ro_equipment_availability
         (report_id, equipment, in_service, stand_by, out_of_service)
       VALUES ($1, $2, $3, $4, $5)`,
      [reportId, e.equipment, e.inService, e.standBy, e.outOfService]
    );
  }
  console.log(`  ↳ Inserted ${equipment.length} equipment availability rows`);

  // ── 4. Treatment units ───────────────────────────────────────────────────
  const treatmentSets = [
    { passType: "1st Pass RO", units: pass1Units, hasInletFlow: false },
    { passType: "2nd Pass RO", units: pass2Units, hasInletFlow: false },
    { passType: "MB",          units: mbUnits,    hasInletFlow: true  },
  ];
  let treatmentCount = 0;
  for (const { passType, units, hasInletFlow } of treatmentSets) {
    for (const u of units) {
      await client.query(
        `INSERT INTO ro_treatment_units
           (report_id, pass_type, unit_number, status, inlet_pressure, dp_bar, inlet_flow)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          reportId,
          passType,
          u.unitNumber,
          u.status,
          hasInletFlow ? null : u.inletPressure,
          u.dp,
          hasInletFlow ? u.inletFlow : null,
        ]
      );
      treatmentCount++;
    }
  }
  console.log(`  ↳ Inserted ${treatmentCount} treatment unit rows`);

  // ── 5. Tank levels ───────────────────────────────────────────────────────
  await client.query(
    `INSERT INTO ro_tank_levels (
       report_id,
       sw_a_mm, sw_b_mm, dm_a_mm, dm_b_mm,
       sw_a_m3, sw_b_m3, dm_a_m3, dm_b_m3,
       sw_production_m3hr, dm_production_m3hr,
       sw_production_24h,  sw_consumption_24h,
       dm_production_24h,  dm_consumption_24h
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
    [
      reportId,
      tanks.swAMm,  tanks.swBMm,  tanks.dmAMm,  tanks.dmBMm,
      tanks.swAM3,  tanks.swBM3,  tanks.dmAM3,  tanks.dmBM3,
      tanks.swProductionM3hr, tanks.dmProductionM3hr,
      tanks.swProduction24h,  tanks.swConsumption24h,
      tanks.dmProduction24h,  tanks.dmConsumption24h,
    ]
  );
  console.log("  ↳ Inserted tank levels row");

  // ── 6. Activity log ──────────────────────────────────────────────────────
  let actCount = 0;
  for (const a of activities) {
    if (!a.description) continue;
    await client.query(
      `INSERT INTO ro_activity_log (report_id, activity_time, description)
       VALUES ($1, $2, $3)`,
      [reportId, a.time, a.description]
    );
    actCount++;
  }
  console.log(`  ↳ Inserted ${actCount} activity log entries`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: node ro_report_import.js <path-to-csv>");
    process.exit(1);
  }

  const resolved = path.resolve(filePath);
  console.log(`\nParsing: ${resolved}`);

  let data;
  try {
    data = await parseReport(resolved);
  } catch (err) {
    console.error("Parse error:", err.message);
    process.exit(1);
  }

  console.log("\nConnecting to database …");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await ensureSchema(client);
    console.log("\nInserting report …");
    await insertReport(client, data);
    await client.query("COMMIT");
    console.log("\n✓ Import complete.\n");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Database error:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
