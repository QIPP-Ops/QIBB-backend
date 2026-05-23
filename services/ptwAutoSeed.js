const fs = require('fs');
const path = require('path');
const AdminConfig = require('../models/AdminConfig');

const JSON_PATH = path.join(__dirname, '../data/ptw-authorization-2026.json');
const EXPECTED_COUNT = 63;

function loadPtwJson() {
  if (!fs.existsSync(JSON_PATH)) {
    throw new Error('Missing data/ptw-authorization-2026.json');
  }
  const rows = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  if (!Array.isArray(rows) || rows.length !== EXPECTED_COUNT) {
    throw new Error(
      `PTW JSON must contain exactly ${EXPECTED_COUNT} entries (found ${Array.isArray(rows) ? rows.length : 0})`
    );
  }
  return rows;
}

/**
 * Seed PTW authorization list when empty or incomplete (production has no SSH).
 * @param {{ force?: boolean }} options - force replaces list even when populated
 */
async function ensurePtwPersonnelSeeded(options = {}) {
  const force = Boolean(options.force);
  let config = await AdminConfig.findOne();
  if (!config) config = new AdminConfig();

  const current = config.ptwPersonnel?.length || 0;
  if (!force && current >= EXPECTED_COUNT) {
    return { seeded: false, count: current, reason: 'already_populated' };
  }

  const rows = loadPtwJson();
  config.ptwPersonnel = rows;
  await config.save();
  return { seeded: true, count: rows.length, previousCount: current };
}

module.exports = { ensurePtwPersonnelSeeded, loadPtwJson, EXPECTED_COUNT };
