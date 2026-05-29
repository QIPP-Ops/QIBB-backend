const fs = require('fs');
const path = require('path');
const AdminConfig = require('../models/AdminConfig');
const AdminUser = require('../models/AdminUser');
const { hasPortalAdminAccess } = require('../middleware/superAdmin');
const { notifyQuizAssigned, notifyQuizCompleted, listAdmins } = require('../services/notificationService');

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

/** Admin assigns a quiz to members and/or an entire crew. */
exports.assignQuiz = async (req, res) => {
  try {
    if (!hasPortalAdminAccess(req)) {
      return res.status(403).json({ message: 'Access denied. Administrator privileges required.' });
    }
    const { quizTitle, userIds = [], crew } = req.body || {};
    const title = String(quizTitle || '').trim();
    if (!title) {
      return res.status(400).json({ message: 'quizTitle is required' });
    }

    let targets = [];
    if (Array.isArray(userIds) && userIds.length) {
      targets = await AdminUser.find({ _id: { $in: userIds }, approved: true }).select('_id').lean();
    } else if (crew) {
      targets = await AdminUser.find({ crew: String(crew), approved: true }).select('_id').lean();
    } else {
      return res.status(400).json({ message: 'Provide userIds or crew' });
    }

    for (const user of targets) {
      await notifyQuizAssigned(user._id, title);
    }

    res.status(201).json({ success: true, notified: targets.length, quizTitle: title });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/** Member marks a quiz complete — notifies all admins. */
exports.completeQuiz = async (req, res) => {
  try {
    const { quizTitle } = req.body || {};
    const title = String(quizTitle || '').trim();
    if (!title) {
      return res.status(400).json({ message: 'quizTitle is required' });
    }

    const userName = req.user?.name || req.user?.empId || 'Member';
    const admins = await listAdmins();
    for (const admin of admins) {
      await notifyQuizCompleted(admin._id, userName, title);
    }

    res.json({ success: true, notifiedAdmins: admins.length, quizTitle: title });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
