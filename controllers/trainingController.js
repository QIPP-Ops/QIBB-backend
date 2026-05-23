const fs = require('fs');
const path = require('path');
const AdminConfig = require('../models/AdminConfig');

const catalogPath = path.join(__dirname, '../data/training-catalog.json');
const seedPath = path.join(__dirname, '../data/completed-courses-seed.json');

function loadCatalog() {
  if (!fs.existsSync(catalogPath)) return [];
  return JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
}

async function getOrCreateConfig() {
  let config = await AdminConfig.findOne();
  if (!config) {
    config = new AdminConfig();
    await config.save();
  }
  return config;
}

async function ensureCompletedCourses(config) {
  if (config.completedCourses?.length) return config;
  if (!fs.existsSync(seedPath)) return config;
  const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  config.completedCourses = seed;
  await config.save();
  return config;
}

exports.getCatalog = async (_req, res) => {
  try {
    res.json({ success: true, data: loadCatalog(), provider: 'local' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getCompletedCourses = async (_req, res) => {
  try {
    const config = await ensureCompletedCourses(await getOrCreateConfig());
    res.json({ success: true, data: config.completedCourses || [], provider: 'local' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.addCatalogToCurriculum = async (req, res) => {
  try {
    const { catalogId } = req.body;
    const item = loadCatalog().find((c) => c.id === catalogId);
    if (!item) return res.status(404).json({ message: 'Catalog item not found' });

    const config = await getOrCreateConfig();
    const exists = config.curriculum.some(
      (c) => c.title === item.title && c.category === item.category
    );
    if (exists) {
      return res.status(409).json({ message: 'Already in curriculum' });
    }

    config.curriculum.push({
      category: item.category,
      title: item.title,
      description: item.description || '',
      duration: item.duration || '',
      link: '',
    });
    await config.save();
    res.status(201).json({ success: true, curriculum: config.curriculum });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
