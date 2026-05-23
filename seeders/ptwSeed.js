const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const AdminConfig = require('../models/AdminConfig');

const jsonPath = path.join(__dirname, '../data/ptw-authorization-2026.json');

if (!fs.existsSync(jsonPath)) {
  console.error(
    'Missing data/ptw-authorization-2026.json. Generate it with:\n' +
      '  node scripts/parse-ptw-excel.js "<path-to-xlsx>"'
  );
  process.exit(1);
}

const PTW_PERSONNEL = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

if (!Array.isArray(PTW_PERSONNEL) || PTW_PERSONNEL.length === 0) {
  console.error('PTW authorization JSON is empty or invalid.');
  process.exit(1);
}

async function seed() {
  await mongoose.connect(process.env.COSMOS_URI, { retryWrites: false });
  const config = (await AdminConfig.findOne()) || new AdminConfig();
  config.ptwPersonnel = PTW_PERSONNEL;
  await config.save();
  console.log(`✅ Replaced PTW authorization list with ${PTW_PERSONNEL.length} personnel from JSON.`);
  mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
