const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const AdminConfig = require('../models/AdminConfig');
const AdminUser = require('../models/AdminUser');
const Quiz = require('../models/Quiz');
const QuizAssignment = require('../models/QuizAssignment');
const { hasPortalAdminAccess, isSuperAdmin } = require('../middleware/superAdmin');
const {
  notifyQuizAssigned,
  notifyQuizCompleted,
  notifyQuizPrizeClaimed,
  listAdmins,
} = require('../services/notificationService');
const { isValidHtml } = require('../utils/validateHtml');
const quizStorage = require('../services/quizStorage');
const { logAction } = require('../services/auditLogService');
const AUDIT_ACTIONS = require('../constants/auditActions');

const catalogPath = path.join(__dirname, '../data/training-catalog.json');
const seedPath = path.join(__dirname, '../data/completed-courses-seed.json');

const PRIZE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

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

function currentUserId(req) {
  return req.user?.userId || req.user?.id;
}

async function canAccessQuizHtml(req, quizId) {
  if (hasPortalAdminAccess(req)) return true;
  const userId = currentUserId(req);
  if (!userId) return false;
  const hit = await QuizAssignment.findOne({
    quizId,
    userId,
  }).lean();
  return Boolean(hit);
}

async function assignmentCountsByQuiz() {
  const rows = await QuizAssignment.aggregate([
    {
      $group: {
        _id: '$quizId',
        assignedCount: { $sum: 1 },
        completionCount: {
          $sum: { $cond: [{ $ifNull: ['$completedAt', false] }, 1, 0] },
        },
      },
    },
  ]);
  const map = new Map();
  for (const r of rows) {
    map.set(String(r._id), {
      assignedCount: r.assignedCount,
      completionCount: r.completionCount,
    });
  }
  return map;
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

/** Super admin: upload HTML quiz + metadata. */
exports.uploadQuiz = async (req, res) => {
  try {
    if (!isSuperAdmin(req)) {
      return res.status(403).json({ message: 'Only the super administrator may upload quizzes.' });
    }
    const title = String(req.body?.title || '').trim();
    const prizeDescription = String(req.body?.prizeDescription || '').trim();
    if (!title) return res.status(400).json({ message: 'title is required' });
    if (!prizeDescription) return res.status(400).json({ message: 'prizeDescription is required' });

    const htmlFile = req.files?.html?.[0] || req.file;
    if (!htmlFile?.buffer) {
      return res.status(400).json({ message: 'An .html quiz file is required' });
    }
    const original = String(htmlFile.originalname || '').toLowerCase();
    if (!original.endsWith('.html') && !original.endsWith('.htm')) {
      return res.status(400).json({ message: 'Only .html files are accepted' });
    }
    const htmlText = htmlFile.buffer.toString('utf8');
    if (!isValidHtml(htmlText)) {
      return res.status(400).json({ message: 'Invalid HTML document' });
    }

    const quiz = new Quiz({
      title,
      prizeDescription,
      prizeImageUrl: '',
      htmlStorageKey: 'pending',
      uploadedBy: currentUserId(req),
      uploadedAt: new Date(),
    });
    await quiz.save();

    const htmlKey = await quizStorage.saveQuizHtml(quiz._id, htmlFile.buffer);
    quiz.htmlStorageKey = htmlKey;

    const prizeFile = req.files?.prizeImage?.[0];
    if (prizeFile?.buffer) {
      const mime = prizeFile.mimetype || 'image/jpeg';
      if (!PRIZE_IMAGE_TYPES.has(mime)) {
        await Quiz.deleteOne({ _id: quiz._id });
        await quizStorage.deleteQuizFiles(quiz._id);
        return res.status(400).json({ message: 'Prize image must be JPEG, PNG, WebP, or GIF' });
      }
      quiz.prizeImageUrl = await quizStorage.savePrizeImage(quiz._id, prizeFile.buffer, mime);
    }

    await quiz.save();
    await logAction({
      actor: req.user,
      action: AUDIT_ACTIONS.QUIZ_UPLOADED,
      targetType: 'quiz',
      targetId: quiz._id?.toString(),
      targetName: quiz.title,
      after: {
        title: quiz.title,
        prizeDescription,
        prizeImageUrl: quiz.prizeImageUrl,
      },
      req,
    });
    res.status(201).json({
      success: true,
      quiz: {
        id: quiz._id,
        title: quiz.title,
        prizeDescription: quiz.prizeDescription,
        prizeImageUrl: quiz.prizeImageUrl,
        uploadedAt: quiz.uploadedAt,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/** List quizzes — admin: all; member: assigned only. */
exports.listQuizzes = async (req, res) => {
  try {
    const isAdmin = hasPortalAdminAccess(req);
    const counts = await assignmentCountsByQuiz();

    if (isAdmin) {
      const quizzes = await Quiz.find().sort({ uploadedAt: -1 }).lean();
      const data = quizzes.map((q) => {
        const c = counts.get(String(q._id)) || { assignedCount: 0, completionCount: 0 };
        return {
          id: q._id,
          title: q.title,
          prizeDescription: q.prizeDescription,
          prizeImageUrl: q.prizeImageUrl,
          uploadedAt: q.uploadedAt,
          assignedCount: c.assignedCount,
          completionCount: c.completionCount,
        };
      });
      return res.json({ success: true, data, role: isSuperAdmin(req) ? 'super_admin' : 'admin' });
    }

    const userId = currentUserId(req);
    const assignments = await QuizAssignment.find({ userId })
      .sort({ assignedAt: -1 })
      .populate('quizId')
      .lean();

    const data = assignments
      .filter((a) => a.quizId)
      .map((a) => ({
        assignmentId: a._id,
        quizId: a.quizId._id,
        title: a.quizId.title,
        prizeDescription: a.quizId.prizeDescription,
        prizeImageUrl: a.quizId.prizeImageUrl,
        assignedAt: a.assignedAt,
        dueDate: a.dueDate,
        completedAt: a.completedAt,
        score: a.score,
        status: a.completedAt ? 'Completed' : 'Pending',
      }));

    res.json({ success: true, data, role: 'member' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/** Super admin: delete quiz and assignments. */
exports.deleteQuiz = async (req, res) => {
  try {
    if (!isSuperAdmin(req)) {
      return res.status(403).json({ message: 'Only the super administrator may delete quizzes.' });
    }
    const { quizId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(quizId)) {
      return res.status(400).json({ message: 'Invalid quiz id' });
    }
    const quiz = await Quiz.findById(quizId);
    if (!quiz) return res.status(404).json({ message: 'Quiz not found' });

    const keys = [quiz.htmlStorageKey, quiz.prizeImageUrl].filter(Boolean);
    await QuizAssignment.deleteMany({ quizId });
    await Quiz.deleteOne({ _id: quizId });
    await quizStorage.deleteQuizFiles(quizId, keys);
    await logAction({
      actor: req.user,
      action: AUDIT_ACTIONS.QUIZ_DELETED,
      targetType: 'quiz',
      targetId: quiz._id?.toString(),
      targetName: quiz.title,
      before: quiz.toObject ? quiz.toObject() : quiz,
      req,
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/** Super admin: completion results for a quiz. */
exports.getQuizResults = async (req, res) => {
  try {
    if (!isSuperAdmin(req)) {
      return res.status(403).json({ message: 'Only the super administrator may view quiz results.' });
    }
    const { quizId } = req.params;
    const quiz = await Quiz.findById(quizId).lean();
    if (!quiz) return res.status(404).json({ message: 'Quiz not found' });

    const rows = await QuizAssignment.find({ quizId, completedAt: { $ne: null } })
      .sort({ completedAt: -1 })
      .populate('userId', 'name empId crew email')
      .lean();

    res.json({
      success: true,
      quiz: { id: quiz._id, title: quiz.title },
      completions: rows.map((r) => ({
        userId: r.userId?._id,
        name: r.userId?.name,
        empId: r.userId?.empId,
        crew: r.userId?.crew,
        email: r.userId?.email,
        completedAt: r.completedAt,
        score: r.score,
        assignedAt: r.assignedAt,
        dueDate: r.dueDate,
      })),
    });
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
    const { quizId, userIds = [], crew, dueDate } = req.body || {};
    if (!quizId) {
      return res.status(400).json({ message: 'quizId is required' });
    }
    const quiz = await Quiz.findById(quizId);
    if (!quiz) return res.status(404).json({ message: 'Quiz not found' });

    let targets = [];
    if (Array.isArray(userIds) && userIds.length) {
      targets = await AdminUser.find({ _id: { $in: userIds }, approved: true }).select('_id').lean();
    } else if (crew) {
      targets = await AdminUser.find({ crew: String(crew), approved: true }).select('_id').lean();
    } else {
      return res.status(400).json({ message: 'Provide userIds or crew' });
    }

    const due = dueDate ? new Date(dueDate) : null;
    if (dueDate && Number.isNaN(due?.getTime())) {
      return res.status(400).json({ message: 'Invalid dueDate' });
    }

    let assigned = 0;
    for (const user of targets) {
      await QuizAssignment.findOneAndUpdate(
        { quizId: quiz._id, userId: user._id },
        {
          $set: { assignedAt: new Date(), dueDate: due },
          $setOnInsert: { completedAt: null, score: null },
        },
        { upsert: true, new: true }
      );
      await notifyQuizAssigned(user._id, quiz.title, { quizId: String(quiz._id) });
      assigned += 1;
    }
    await logAction({
      actor: req.user,
      action: AUDIT_ACTIONS.QUIZ_ASSIGNED,
      targetType: 'quiz',
      targetId: quiz._id?.toString(),
      targetName: quiz.title,
      after: { assignedCount: assigned, crew: crew || null, dueDate: due },
      req,
    });

    res.status(201).json({
      success: true,
      notified: assigned,
      quizId: quiz._id,
      quizTitle: quiz.title,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/** Member marks a quiz complete — notifies all admins. */
exports.completeQuiz = async (req, res) => {
  try {
    const { quizId, score } = req.body || {};
    if (!quizId) {
      return res.status(400).json({ message: 'quizId is required' });
    }
    const quiz = await Quiz.findById(quizId);
    if (!quiz) return res.status(404).json({ message: 'Quiz not found' });

    const userId = currentUserId(req);
    const assignment = await QuizAssignment.findOne({ quizId, userId });
    if (!assignment) {
      return res.status(403).json({ message: 'You are not assigned this quiz' });
    }

    const scoreVal =
      score === null || score === undefined || score === ''
        ? null
        : Number(score);
    if (scoreVal !== null && Number.isNaN(scoreVal)) {
      return res.status(400).json({ message: 'Invalid score' });
    }

    if (!assignment.completedAt) {
      assignment.completedAt = new Date();
      assignment.score = scoreVal;
      await assignment.save();
    }

    const userName = req.user?.name || req.user?.displayName || req.user?.empId || 'Member';
    const admins = await listAdmins();
    for (const admin of admins) {
      await notifyQuizCompleted(admin._id, userName, quiz.title, {
        quizId: String(quiz._id),
        score: assignment.score,
      });
    }

    res.json({
      success: true,
      notifiedAdmins: admins.length,
      quizId: quiz._id,
      quizTitle: quiz.title,
      score: assignment.score,
      kpiCacheInvalidate: true,
      kpiCacheTtlMs: 5 * 60 * 1000,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/** Member claims prize — notifies admins. */
exports.claimQuizPrize = async (req, res) => {
  try {
    const { quizId } = req.body || {};
    if (!quizId) return res.status(400).json({ message: 'quizId is required' });
    const quiz = await Quiz.findById(quizId);
    if (!quiz) return res.status(404).json({ message: 'Quiz not found' });

    const userId = currentUserId(req);
    const assignment = await QuizAssignment.findOne({ quizId, userId, completedAt: { $ne: null } });
    if (!assignment) {
      return res.status(403).json({ message: 'Complete the quiz before claiming a prize' });
    }

    const userName = req.user?.name || req.user?.displayName || req.user?.empId || 'Member';
    const admins = await listAdmins();
    for (const admin of admins) {
      await notifyQuizPrizeClaimed(admin._id, userName, quiz.title);
    }

    res.json({ success: true, notifiedAdmins: admins.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/** Authenticated HTML delivery (assigned member or admin). */
exports.getQuizHtml = async (req, res) => {
  try {
    const { quizId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(quizId)) {
      return res.status(400).json({ message: 'Invalid quiz id' });
    }
    if (!(await canAccessQuizHtml(req, quizId))) {
      return res.status(403).json({ message: 'Access denied' });
    }
    const quiz = await Quiz.findById(quizId).lean();
    if (!quiz) return res.status(404).json({ message: 'Quiz not found' });

    const buffer = await quizStorage.readStorage(quiz.htmlStorageKey);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/** Prize image for assigned member or admin. */
exports.getQuizPrizeImage = async (req, res) => {
  try {
    const { quizId } = req.params;
    if (!(await canAccessQuizHtml(req, quizId))) {
      return res.status(403).json({ message: 'Access denied' });
    }
    const quiz = await Quiz.findById(quizId).lean();
    if (!quiz?.prizeImageUrl) return res.status(404).json({ message: 'No prize image' });

    const buffer = await quizStorage.readPrizeImage(quiz.prizeImageUrl);
    const ext = quiz.prizeImageUrl.split('.').pop()?.toLowerCase();
    const mime =
      ext === 'png'
        ? 'image/png'
        : ext === 'webp'
          ? 'image/webp'
          : ext === 'gif'
            ? 'image/gif'
            : 'image/jpeg';
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
