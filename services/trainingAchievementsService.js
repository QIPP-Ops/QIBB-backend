const AdminConfig = require('../models/AdminConfig');
const AdminUser = require('../models/AdminUser');
const CourseAssignment = require('../models/CourseAssignment');
const Quiz = require('../models/Quiz');
const QuizAssignment = require('../models/QuizAssignment');
const QuizAttempt = require('../models/QuizAttempt');

function normalizeName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function matchesUser(record, user) {
  const empId = String(user.empId || '').trim();
  const name = normalizeName(user.name);
  if (empId && String(record.empId || '').trim() === empId) return true;
  const recordName = normalizeName(record.employeeName || record.name || record.userName);
  if (name && recordName && recordName === name) return true;
  if (record.userId && user._id && String(record.userId) === String(user._id)) return true;
  return false;
}

function achievementKey(item) {
  return `${item.type}:${item.empId || item.userId || item.employeeName}:${item.title}:${item.completedAt}`;
}

async function loadCourseCompletionsFromConfig() {
  const config = await AdminConfig.findOne().select('completedCourses').lean();
  return (config?.completedCourses || []).map((c) => ({
    type: 'course',
    empId: c.empId || '',
    employeeName: c.employeeName,
    title: c.courseTitle,
    completedAt: c.completedAt ? new Date(c.completedAt) : null,
    score: null,
    source: 'record',
  }));
}

async function loadCourseAssignmentCompletions() {
  const rows = await CourseAssignment.find({ completedAt: { $ne: null } })
    .sort({ completedAt: -1 })
    .populate('userId', 'name empId crew')
    .lean();
  return rows.map((r) => ({
    type: 'course',
    userId: r.userId?._id,
    empId: r.empId || r.userId?.empId || '',
    employeeName: r.userId?.name || 'Member',
    title: r.courseTitle,
    completedAt: r.completedAt ? new Date(r.completedAt) : null,
    score: null,
    source: 'assignment',
    assignmentId: r._id,
  }));
}

async function loadQuizAssignmentCompletions() {
  const rows = await QuizAssignment.find({ completedAt: { $ne: null } })
    .sort({ completedAt: -1 })
    .populate('quizId', 'title')
    .populate('userId', 'name empId crew')
    .lean();
  return rows
    .filter((r) => r.quizId)
    .map((r) => ({
      type: 'quiz',
      userId: r.userId?._id,
      empId: r.userId?.empId || '',
      employeeName: r.userId?.name || 'Member',
      title: r.quizId.title,
      completedAt: r.completedAt ? new Date(r.completedAt) : null,
      score: r.score ?? null,
      source: 'assignment',
      assignmentId: r._id,
      quizId: r.quizId._id,
    }));
}

async function loadPassedQuizAttempts() {
  const rows = await QuizAttempt.find({ passed: true })
    .sort({ completedAt: -1 })
    .populate('quizId', 'title')
    .populate('userId', 'name empId crew')
    .lean();
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    if (!r.quizId) continue;
    const uid = r.userId?._id || r.userId;
    const key = `${uid}:${r.quizId._id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      type: 'quiz',
      userId: r.userId?._id,
      empId: r.empId || r.userId?.empId || '',
      employeeName: r.userName || r.userId?.name || 'Member',
      title: r.quizId.title,
      completedAt: r.completedAt ? new Date(r.completedAt) : null,
      score: r.percent ?? null,
      source: 'attempt',
      quizId: r.quizId._id,
    });
  }
  return out;
}

function dedupeAndSort(items, limit = 20) {
  const map = new Map();
  for (const item of items) {
    if (!item.completedAt) continue;
    const key = achievementKey(item);
    const existing = map.get(key);
    if (!existing || item.completedAt > existing.completedAt) {
      map.set(key, item);
    }
  }
  return [...map.values()]
    .sort((a, b) => b.completedAt - a.completedAt)
    .slice(0, limit)
    .map((item) => ({
      ...item,
      completedAt: item.completedAt.toISOString(),
    }));
}

async function getRecentAchievements({ limit = 20 } = {}) {
  const [configCourses, assignmentCourses, quizAssignments, quizAttempts] = await Promise.all([
    loadCourseCompletionsFromConfig(),
    loadCourseAssignmentCompletions(),
    loadQuizAssignmentCompletions(),
    loadPassedQuizAttempts(),
  ]);
  return dedupeAndSort(
    [...configCourses, ...assignmentCourses, ...quizAssignments, ...quizAttempts],
    limit
  );
}

async function getUserCertificates(userId) {
  const user = await AdminUser.findById(userId).select('_id empId name').lean();
  if (!user) return [];

  const [configCourses, assignmentCourses, quizAssignments, quizAttempts] = await Promise.all([
    loadCourseCompletionsFromConfig(),
    loadCourseAssignmentCompletions(),
    loadQuizAssignmentCompletions(),
    loadPassedQuizAttempts(),
  ]);

  const all = [...configCourses, ...assignmentCourses, ...quizAssignments, ...quizAttempts];
  const mine = all.filter((item) => matchesUser(item, user));
  return dedupeAndSort(mine, 100).map((item) => ({
    id: item.assignmentId || item.quizId || `${item.type}-${item.title}`,
    type: item.type,
    title: item.title,
    completedAt: item.completedAt,
    score: item.score,
    kind: item.type === 'quiz' ? 'Quiz Certificate' : 'Course Certificate',
  }));
}

module.exports = {
  getRecentAchievements,
  getUserCertificates,
  matchesUser,
};
