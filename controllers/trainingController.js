const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const AdminConfig = require('../models/AdminConfig');
const AdminUser = require('../models/AdminUser');
const Quiz = require('../models/Quiz');
const QuizAssignment = require('../models/QuizAssignment');
const QuizAttempt = require('../models/QuizAttempt');
const { hasPortalAdminAccess, isSuperAdmin } = require('../middleware/superAdmin');
const {
  notifyQuizAssigned,
  notifyQuizCompleted,
  notifyQuizPrizeClaimed,
} = require('../services/notificationService');
const { isValidHtml } = require('../utils/validateHtml');
const quizStorage = require('../services/quizStorage');
const { logAction } = require('../services/auditLogService');
const AUDIT_ACTIONS = require('../constants/auditActions');
const { isEmailConfigured } = require('../services/emailService');
const {
  sendCourseReminderEmail,
  upsertCourseAssignments,
} = require('../services/courseReminderService');

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

function quizMetaFields(q) {
  return {
    id: q._id,
    title: q.title,
    prizeDescription: q.prizeDescription,
    prizeImageUrl: q.prizeImageUrl,
    staticHtmlUrl: q.staticHtmlUrl || '',
    hubAccessible: Boolean(q.hubAccessible),
    passPercent: q.passPercent ?? 80,
    rewardQrEnabled: Boolean(q.rewardQrEnabled),
    rewardQrUrl: q.rewardQrUrl || '',
    rewardQrImageUrl: q.rewardQrImageUrl || '',
    rewardTitle: q.rewardTitle || '',
    rewardMessage: q.rewardMessage || '',
    uploadedAt: q.uploadedAt,
  };
}

async function canAccessQuiz(req, quizId) {
  if (hasPortalAdminAccess(req)) return true;
  const userId = currentUserId(req);
  if (!userId) return false;
  const quiz = await Quiz.findById(quizId).select('hubAccessible').lean();
  if (quiz?.hubAccessible) return true;
  const hit = await QuizAssignment.findOne({ quizId, userId }).lean();
  return Boolean(hit);
}

async function canAccessQuizHtml(req, quizId) {
  return canAccessQuiz(req, quizId);
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

async function attemptCountsByQuiz() {
  const rows = await QuizAttempt.aggregate([
    { $group: { _id: '$quizId', attemptCount: { $sum: 1 } } },
  ]);
  const map = new Map();
  for (const r of rows) {
    map.set(String(r._id), r.attemptCount);
  }
  return map;
}

/** List quizzes — admin: all; member: assigned + hub-accessible. */
exports.listQuizzes = async (req, res) => {
  try {
    const isAdmin = hasPortalAdminAccess(req);
    const counts = await assignmentCountsByQuiz();
    const attemptCounts = await attemptCountsByQuiz();

    if (isAdmin) {
      const quizzes = await Quiz.find().sort({ uploadedAt: -1 }).lean();
      const data = quizzes.map((q) => {
        const c = counts.get(String(q._id)) || { assignedCount: 0, completionCount: 0 };
        return {
          ...quizMetaFields(q),
          assignedCount: c.assignedCount,
          completionCount: c.completionCount,
          attemptCount: attemptCounts.get(String(q._id)) || 0,
        };
      });
      return res.json({ success: true, data, role: isSuperAdmin(req) ? 'super_admin' : 'admin' });
    }

    const userId = currentUserId(req);
    const assignments = await QuizAssignment.find({ userId })
      .sort({ assignedAt: -1 })
      .populate('quizId')
      .lean();

    const assignedQuizIds = new Set();
    const data = assignments
      .filter((a) => a.quizId)
      .map((a) => {
        assignedQuizIds.add(String(a.quizId._id));
        return {
          assignmentId: a._id,
          quizId: a.quizId._id,
          title: a.quizId.title,
          prizeDescription: a.quizId.prizeDescription,
          prizeImageUrl: a.quizId.prizeImageUrl,
          staticHtmlUrl: a.quizId.staticHtmlUrl || '',
          hubAccessible: Boolean(a.quizId.hubAccessible),
          passPercent: a.quizId.passPercent ?? 80,
          rewardQrEnabled: Boolean(a.quizId.rewardQrEnabled),
          rewardQrUrl: a.quizId.rewardQrUrl || '',
          rewardQrImageUrl: a.quizId.rewardQrImageUrl || '',
          rewardTitle: a.quizId.rewardTitle || '',
          rewardMessage: a.quizId.rewardMessage || '',
          assignedAt: a.assignedAt,
          dueDate: a.dueDate,
          completedAt: a.completedAt,
          score: a.score,
          status: a.completedAt ? 'Completed' : 'Pending',
        };
      });

    const hubQuizzes = await Quiz.find({ hubAccessible: true }).sort({ uploadedAt: -1 }).lean();
    for (const q of hubQuizzes) {
      if (assignedQuizIds.has(String(q._id))) continue;
      const latest = await QuizAttempt.findOne({ quizId: q._id, userId })
        .sort({ completedAt: -1 })
        .lean();
      data.push({
        assignmentId: null,
        quizId: q._id,
        title: q.title,
        prizeDescription: q.prizeDescription,
        prizeImageUrl: q.prizeImageUrl,
        staticHtmlUrl: q.staticHtmlUrl || '',
        hubAccessible: true,
        passPercent: q.passPercent ?? 80,
        rewardQrEnabled: Boolean(q.rewardQrEnabled),
        rewardQrUrl: q.rewardQrUrl || '',
        rewardQrImageUrl: q.rewardQrImageUrl || '',
        rewardTitle: q.rewardTitle || '',
        rewardMessage: q.rewardMessage || '',
        assignedAt: null,
        dueDate: null,
        completedAt: latest?.completedAt ?? null,
        score: latest?.percent ?? null,
        status: latest ? 'Completed' : 'Pending',
        latestAttemptPassed: latest?.passed ?? null,
      });
    }

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

/** Admin: completion results for a quiz (legacy assignment view). */
exports.getQuizResults = async (req, res) => {
  try {
    if (!hasPortalAdminAccess(req)) {
      return res.status(403).json({ message: 'Access denied. Administrator privileges required.' });
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

/** Admin: all recorded attempts, filterable by quiz/user/date. */
exports.listQuizAttempts = async (req, res) => {
  try {
    if (!hasPortalAdminAccess(req)) {
      return res.status(403).json({ message: 'Access denied. Administrator privileges required.' });
    }

    const { quizId, userId, from, to, limit = '200' } = req.query;
    const filter = {};

    if (quizId) {
      if (!mongoose.Types.ObjectId.isValid(String(quizId))) {
        return res.status(400).json({ message: 'Invalid quizId' });
      }
      filter.quizId = quizId;
    }
    if (userId) {
      if (!mongoose.Types.ObjectId.isValid(String(userId))) {
        return res.status(400).json({ message: 'Invalid userId' });
      }
      filter.userId = userId;
    }
    if (from || to) {
      filter.completedAt = {};
      if (from) {
        const d = new Date(from);
        if (Number.isNaN(d.getTime())) return res.status(400).json({ message: 'Invalid from date' });
        filter.completedAt.$gte = d;
      }
      if (to) {
        const d = new Date(to);
        if (Number.isNaN(d.getTime())) return res.status(400).json({ message: 'Invalid to date' });
        filter.completedAt.$lte = d;
      }
    }

    const cap = Math.min(Math.max(parseInt(String(limit), 10) || 200, 1), 1000);
    const rows = await QuizAttempt.find(filter)
      .sort({ completedAt: -1 })
      .limit(cap)
      .populate('quizId', 'title catalogSlug')
      .populate('userId', 'name empId crew email')
      .lean();

    res.json({
      success: true,
      attempts: rows.map((r) => ({
        id: r._id,
        quizId: r.quizId?._id,
        quizTitle: r.quizId?.title,
        catalogSlug: r.quizId?.catalogSlug,
        userId: r.userId?._id,
        userName: r.userName || r.userId?.name,
        empId: r.empId || r.userId?.empId,
        crew: r.userId?.crew,
        email: r.userId?.email,
        score: r.score,
        maxScore: r.maxScore,
        percent: r.percent,
        passed: r.passed,
        startedAt: r.startedAt,
        completedAt: r.completedAt,
        durationSeconds: r.durationSeconds,
        answers: r.answers,
      })),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/** Record every quiz attempt with score and answer summary. */
exports.recordQuizAttempt = async (req, res) => {
  try {
    const { quizId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(quizId)) {
      return res.status(400).json({ message: 'Invalid quiz id' });
    }
    if (!(await canAccessQuiz(req, quizId))) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const quiz = await Quiz.findById(quizId);
    if (!quiz) return res.status(404).json({ message: 'Quiz not found' });

    const userId = currentUserId(req);
    const {
      score,
      maxScore,
      percent,
      passed,
      startedAt,
      answers,
      durationSeconds,
    } = req.body || {};

    const scoreVal = Number(score);
    const maxScoreVal = Number(maxScore);
    const percentVal =
      percent === undefined || percent === null ? Number.NaN : Number(percent);
    if (Number.isNaN(scoreVal) || Number.isNaN(maxScoreVal)) {
      return res.status(400).json({ message: 'score and maxScore are required numbers' });
    }

    const computedPercent =
      !Number.isNaN(percentVal) && percentVal >= 0
        ? Math.round(percentVal)
        : maxScoreVal > 0
          ? Math.round((scoreVal / maxScoreVal) * 100)
          : 0;
    const passThreshold = quiz.passPercent ?? 80;
    const passedVal =
      typeof passed === 'boolean' ? passed : computedPercent >= passThreshold;

    const userName = req.user?.name || req.user?.displayName || req.user?.empId || 'Member';
    const empId = req.user?.empId || '';

    const attempt = await QuizAttempt.create({
      quizId,
      userId,
      userName,
      empId,
      score: scoreVal,
      maxScore: maxScoreVal,
      percent: computedPercent,
      passed: passedVal,
      startedAt: startedAt ? new Date(startedAt) : null,
      completedAt: new Date(),
      answers: answers ?? null,
      durationSeconds:
        durationSeconds === undefined || durationSeconds === null
          ? null
          : Number(durationSeconds),
    });

    const assignment = await QuizAssignment.findOne({ quizId, userId });
    if (assignment) {
      if (!assignment.completedAt || computedPercent > (assignment.score ?? -1)) {
        assignment.completedAt = new Date();
        assignment.score = computedPercent;
        await assignment.save();
      }
    }

    if (passedVal) {
      await notifyQuizCompleted(null, userName, quiz.title, {
        quizId: String(quiz._id),
        score: computedPercent,
      });
    }

    res.status(201).json({
      success: true,
      attempt: {
        id: attempt._id,
        percent: computedPercent,
        passed: passedVal,
        rewardQrEnabled: Boolean(quiz.rewardQrEnabled),
        rewardQrUrl: quiz.rewardQrUrl || '',
        rewardQrImageUrl: quiz.rewardQrImageUrl || '',
        rewardTitle: quiz.rewardTitle || '',
        rewardMessage: quiz.rewardMessage || '',
        prizeDescription: quiz.prizeDescription,
        prizeImageUrl: quiz.prizeImageUrl,
      },
      kpiCacheInvalidate: passedVal,
      kpiCacheTtlMs: 5 * 60 * 1000,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/** Super admin: configure QR reward shown on passed attempts. */
exports.updateQuizReward = async (req, res) => {
  try {
    if (!isSuperAdmin(req)) {
      return res.status(403).json({ message: 'Only the super administrator may configure quiz rewards.' });
    }
    const { quizId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(quizId)) {
      return res.status(400).json({ message: 'Invalid quiz id' });
    }
    const quiz = await Quiz.findById(quizId);
    if (!quiz) return res.status(404).json({ message: 'Quiz not found' });

    const {
      rewardQrEnabled,
      rewardQrUrl,
      rewardQrImageUrl,
      rewardTitle,
      rewardMessage,
      passPercent,
    } = req.body || {};

    if (rewardQrEnabled !== undefined) quiz.rewardQrEnabled = Boolean(rewardQrEnabled);
    if (rewardQrUrl !== undefined) quiz.rewardQrUrl = String(rewardQrUrl || '').trim();
    if (rewardQrImageUrl !== undefined) quiz.rewardQrImageUrl = String(rewardQrImageUrl || '').trim();
    if (rewardTitle !== undefined) quiz.rewardTitle = String(rewardTitle || '').trim();
    if (rewardMessage !== undefined) quiz.rewardMessage = String(rewardMessage || '').trim();
    if (passPercent !== undefined) {
      const p = Number(passPercent);
      if (Number.isNaN(p) || p < 0 || p > 100) {
        return res.status(400).json({ message: 'passPercent must be 0–100' });
      }
      quiz.passPercent = p;
    }

    await quiz.save();
    await logAction({
      actor: req.user,
      action: AUDIT_ACTIONS.QUIZ_REWARD_UPDATED,
      targetType: 'quiz',
      targetId: quiz._id?.toString(),
      targetName: quiz.title,
      after: {
        rewardQrEnabled: quiz.rewardQrEnabled,
        rewardQrUrl: quiz.rewardQrUrl,
        rewardQrImageUrl: quiz.rewardQrImageUrl,
        rewardTitle: quiz.rewardTitle,
        rewardMessage: quiz.rewardMessage,
        passPercent: quiz.passPercent,
      },
      req,
    });

    res.json({ success: true, quiz: quizMetaFields(quiz) });
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
    if (!assignment && !quiz.hubAccessible) {
      return res.status(403).json({ message: 'You are not assigned this quiz' });
    }

    const scoreVal =
      score === null || score === undefined || score === ''
        ? null
        : Number(score);
    if (scoreVal !== null && Number.isNaN(scoreVal)) {
      return res.status(400).json({ message: 'Invalid score' });
    }

    if (assignment && !assignment.completedAt) {
      assignment.completedAt = new Date();
      assignment.score = scoreVal;
      await assignment.save();
    }

    const userName = req.user?.name || req.user?.displayName || req.user?.empId || 'Member';
    const recordedScore = assignment?.score ?? scoreVal;
    await notifyQuizCompleted(null, userName, quiz.title, {
      quizId: String(quiz._id),
      score: recordedScore,
    });

    res.json({
      success: true,
      notifiedAdmins: 1,
      quizId: quiz._id,
      quizTitle: quiz.title,
      score: recordedScore,
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
    const passedAttempt = await QuizAttempt.findOne({ quizId, userId, passed: true })
      .sort({ completedAt: -1 })
      .lean();
    if (!assignment && !passedAttempt) {
      return res.status(403).json({ message: 'Complete the quiz before claiming a prize' });
    }

    const userName = req.user?.name || req.user?.displayName || req.user?.empId || 'Member';
    await notifyQuizPrizeClaimed(null, userName, quiz.title);

    res.json({ success: true, notifiedAdmins: 1 });
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
    if (quiz.staticHtmlUrl) {
      return res.status(400).json({
        message: 'This quiz uses a static HTML URL',
        staticHtmlUrl: quiz.staticHtmlUrl,
      });
    }
    if (!quiz.htmlStorageKey) {
      return res.status(404).json({ message: 'Quiz HTML not available' });
    }

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

exports.sendCourseReminder = async (req, res) => {
  try {
    if (!hasPortalAdminAccess(req)) {
      return res.status(403).json({ message: 'Administrator privileges required.' });
    }
    if (!isEmailConfigured()) {
      return res.status(503).json({ message: 'SMTP is not configured on the server.' });
    }

    const {
      courseId,
      courseTitle,
      courseDescription = '',
      courseLink = '',
      empIds = [],
      dueDate = null,
      dryRun = false,
    } = req.body || {};

    const title = String(courseTitle || '').trim();
    if (!title) {
      return res.status(400).json({ message: 'courseTitle is required.' });
    }

    const ids = Array.isArray(empIds) ? empIds.map(String).filter(Boolean) : [];
    if (!ids.length) {
      return res.status(400).json({ message: 'Select at least one employee.' });
    }

    if (dueDate) {
      const due = new Date(dueDate);
      if (Number.isNaN(due.getTime())) {
        return res.status(400).json({ message: 'Invalid dueDate' });
      }
    }

    const { users } = await upsertCourseAssignments({
      courseId: courseId || title,
      courseTitle: title,
      empIds: ids,
      dueDate,
      assignedBy: currentUserId(req),
    });

    if (!users.length) {
      return res.status(400).json({ message: 'No deliverable email addresses for selected employees.' });
    }

    let sent = 0;
    const failed = [];

    for (const user of users) {
      if (dryRun) {
        sent += 1;
        continue;
      }
      try {
        const result = await sendCourseReminderEmail(user, title, courseDescription, courseLink);
        if (result.sent) sent += 1;
        else failed.push({ empId: user.empId, error: result.reason || 'send_failed' });
      } catch (err) {
        failed.push({ empId: user.empId, error: err.message });
      }
    }

    await logAction({
      actor: req.user,
      action: AUDIT_ACTIONS.ADMIN_EMAIL_BROADCAST,
      targetType: 'training_course',
      targetId: courseId || title,
      targetName: title,
      after: { sent, failed: failed.length, empIds: ids, dueDate: dueDate || null },
      req,
    });

    res.json({
      sent,
      failed,
      assigned: users.length,
      dueDate: dueDate || null,
      recipients: users.map((r) => ({ empId: r.empId, name: r.name })),
      dryRun: Boolean(dryRun),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
