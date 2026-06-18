const fs = require('fs');
const path = require('path');
const AdminConfig = require('../models/AdminConfig');
const { getFrontendBaseUrl } = require('../config/frontendUrl');

const catalogPath = path.join(__dirname, '../data/training-catalog.json');

function loadCatalog() {
  if (!fs.existsSync(catalogPath)) return [];
  return JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
}

function isExternalUrl(link) {
  const value = String(link || '').trim();
  return /^https?:\/\//i.test(value);
}

function resolveCourseLink(link) {
  const trimmed = String(link || '').trim();
  if (isExternalUrl(trimmed)) return trimmed;
  return `${getFrontendBaseUrl()}/trainings`;
}

function curriculumKey(item) {
  return `${String(item.category || '').trim().toLowerCase()}::${String(item.title || '').trim().toLowerCase()}`;
}

async function getOrCreateConfig() {
  let config = await AdminConfig.findOne();
  if (!config) {
    config = new AdminConfig();
    await config.save();
  }
  return config;
}

/**
 * Merged Training Hub courses for reminder dropdowns (curriculum first, then catalog).
 */
async function listCoursesForReminder() {
  const config = await getOrCreateConfig();
  const curriculum = config.curriculum || [];
  const catalog = loadCatalog();
  const seen = new Set();
  const courses = [];

  for (const item of curriculum) {
    const id = String(item._id || item.id || item.title || '').trim();
    if (!id) continue;
    seen.add(curriculumKey(item));
    courses.push({
      id,
      title: String(item.title || '').trim(),
      description: String(item.description || '').trim(),
      duration: String(item.duration || '').trim(),
      category: String(item.category || '').trim(),
      link: resolveCourseLink(item.link),
      source: 'curriculum',
    });
  }

  for (const item of catalog) {
    const key = curriculumKey(item);
    if (seen.has(key)) continue;
    const id = String(item.id || item.title || '').trim();
    if (!id) continue;
    courses.push({
      id: `catalog:${id}`,
      title: String(item.title || '').trim(),
      description: String(item.description || '').trim(),
      duration: String(item.duration || '').trim(),
      category: String(item.category || '').trim(),
      link: resolveCourseLink(item.link),
      source: 'catalog',
    });
  }

  courses.sort((a, b) => a.title.localeCompare(b.title));
  return courses;
}

async function findCourseForReminder(courseId) {
  const id = String(courseId || '').trim();
  if (!id) return null;
  const courses = await listCoursesForReminder();
  return courses.find((c) => c.id === id) || null;
}

module.exports = {
  loadCatalog,
  isExternalUrl,
  resolveCourseLink,
  listCoursesForReminder,
  findCourseForReminder,
};
