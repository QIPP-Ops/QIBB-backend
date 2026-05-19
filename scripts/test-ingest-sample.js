#!/usr/bin/env node
/** Test ingest on the 10 sample report types (no DB required for parse-only) */
require('dotenv').config();
const path = require('path');
const mongoose = require('mongoose');
const { ingestWorkbook } = require('../services/plantReports/ingestWorkbook');

const ROOT = process.argv[2] || process.env.PLANT_REPORTS_DIR;
const SAMPLES = [
  '2026-05-19_Daily_water_consumption_followup master.xlsx',
  'Operation Shift report 19.05.2026.xlsx',
  'Daily Operation Report 18.05.2026.xlsx',
  'RO-HRSG Report - APRIL 08, 2026 M.xlsx',
  'GTs FG filter DP 18.05.2026.xlsx',
  'GTs Air Intake Filter 18.05.2026.xlsx',
  'Environment Report 18.05.2026.xlsx',
];

function findFile(name) {
  const fs = require('fs');
  const direct = path.join(ROOT, name);
  if (fs.existsSync(direct)) return direct;
  const stack = [ROOT];
  while (stack.length) {
    const dir = stack.pop();
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) stack.push(full);
      else if (ent.name === name) return full;
    }
  }
  return null;
}

(async () => {
  if (!ROOT) {
    console.error('Set PLANT_REPORTS_DIR or pass folder path');
    process.exit(1);
  }
  let totalPoints = 0;
  let totalHighlights = 0;
  for (const name of SAMPLES) {
    const fp = findFile(name);
    if (!fp) {
      console.log('MISSING', name);
      continue;
    }
    const r = await ingestWorkbook(fp, ROOT);
    console.log(
      name,
      '→',
      r.kind,
      r.reportDate,
      r.points.length,
      'points',
      (r.highlights || []).length,
      'highlights'
    );
    totalPoints += r.points.length;
    totalHighlights += (r.highlights || []).length;
  }
  console.log('\nTotal:', totalPoints, 'points,', totalHighlights, 'highlights');

  if (process.env.COSMOS_URI) {
    await mongoose.connect(process.env.COSMOS_URI);
    const { runPlantIngestion } = require('../services/plantReports/runIngestion');
    process.env.PLANT_REPORTS_DIR = ROOT;
    process.env.PLANT_INGEST_MAX_FILES = '30';
    const result = await runPlantIngestion({ forceAll: false });
    console.log('DB ingest:', result);
    await mongoose.disconnect();
  }
})();
