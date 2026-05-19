/**
 * Seed default Mishkaty-linked curriculum items (run once: node scripts/seed-curriculum.js)
 */
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const AdminConfig = require('../models/AdminConfig');
const { getMongoUri } = require('../config/database');

const MISHKATY = 'https://mishkaty.sabacloud.com/Saba/Web_spf/EU2PRD0191/app/dashboard';

const DEFAULT_CURRICULUM = [
  {
    category: 'Safety Critical',
    title: 'How to Effectively Perform a Job Cycle Check (JCC)',
    description: 'Mishkaty course — safety critical activities and JCC procedure.',
    link: MISHKATY,
    duration: 'Self-paced',
  },
  {
    category: 'Safety Critical',
    title: 'How to Effectively Perform Safety Critical Activities (JCC)',
    description: 'Companion module for safety critical work.',
    link: MISHKATY,
    duration: 'Self-paced',
  },
];

async function seed() {
  const uri = getMongoUri();
  if (!uri) throw new Error('MONGODB_URI or COSMOS_URI required');
  await mongoose.connect(uri, { retryWrites: false });
  const config = (await AdminConfig.findOne()) || new AdminConfig();
  if (config.curriculum?.length) {
    console.log(`Curriculum already has ${config.curriculum.length} items — skipping.`);
  } else {
    config.curriculum = DEFAULT_CURRICULUM;
    await config.save();
    console.log(`Seeded ${DEFAULT_CURRICULUM.length} curriculum items.`);
  }
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
