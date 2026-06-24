const AdminConfig = require('../models/AdminConfig');
const AdminUser = require('../models/AdminUser');
const Notification = require('../models/Notification');
const { findPtwPersonForUser, hasAuth } = require('../middleware/ptwAccess');
const {
  computePtwExpiryInfo,
  mergePtwWithRosterMember,
  resolveMemberEmail,
} = require('../utils/ptwPersonnelMerge');

const AUTH_LEVEL = {
  isolationAuthority: 1,
  permitIssuer: 2,
  safetyCoordinator: 3,
  safetyControllerA: 4,
  safetyControllerB: 4,
  safetyControllerC: 4,
};

const ALL_AUTH_KEYS = Object.keys(AUTH_LEVEL);

function normalizeName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeRole(role) {
  return String(role || '').trim().toLowerCase();
}

function matchesMember(record, member) {
  const empId = String(member.empId || '').trim();
  const name = normalizeName(member.name);
  if (empId && String(record.empId || '').trim() === empId) return true;
  if (name && normalizeName(record.employeeName || record.name) === name) return true;
  return false;
}

/** Role → minimum PTW auth tier (IA=1 … SCO=4). null = N/A (score 100). */
function ptwTargetLevelForRole(role) {
  const r = normalizeRole(role);
  if (!r) return null;

  if (r.includes('local operator') || r.includes('filed operator')) {
    return 1;
  }
  if (r.includes('ccr operator')) return 2;
  if (
    r.includes('shift supervisor') ||
    r.includes('shift in charge engineer') ||
    r === 'shift in charge' ||
    r === 'supervisor'
  ) {
    return 3;
  }
  if (r.includes('chief chemist') || r === 'chemist' || r.includes('chemist')) return 4;
  if (r.includes('operations support') || r === 'management') return 4;

  return null;
}

function maxAuthLevel(person) {
  if (!person?.authorizations?.length) return 0;
  let max = 0;
  for (const key of person.authorizations) {
    const level = AUTH_LEVEL[key];
    if (level && level > max) max = level;
  }
  return max;
}

function calculatePtwScore(member, ptwPerson) {
  const target = ptwTargetLevelForRole(member.role);
  if (target === null) return 100;

  const held = maxAuthLevel(ptwPerson);
  if (held >= target) return 100;
  if (held > 0) return 50;
  return 0;
}

function extractQuizTitleFromAssigned(body) {
  const m = String(body || '').match(/^You have been assigned:\s*(.+)$/i);
  return m ? m[1].trim() : '';
}

function extractQuizTitleFromCompleted(body, userName) {
  const prefix = `${userName} completed `;
  const b = String(body || '');
  if (!b.toLowerCase().startsWith(prefix.toLowerCase())) return '';
  return b.slice(prefix.length).trim();
}

function getQuizAssignmentsForUser(notifications, userId) {
  const titles = new Set();
  for (const n of notifications) {
    if (n.type !== 'quiz_assigned') continue;
    if (String(n.recipientUserId) !== String(userId)) continue;
    const title = extractQuizTitleFromAssigned(n.body) || n.metadata?.quizTitle;
    if (title) titles.add(title.toLowerCase());
  }
  return titles;
}

function getQuizCompletionsForUser(notifications, userName) {
  const titles = new Set();
  const name = String(userName || '').trim();
  if (!name) return titles;
  for (const n of notifications) {
    if (n.type !== 'quiz_completed') continue;
    const title = extractQuizTitleFromCompleted(n.body, name) || n.metadata?.quizTitle;
    if (title) titles.add(title.toLowerCase());
  }
  return titles;
}

function getCurriculumAssignments(curriculum) {
  return (curriculum || []).map((c) => ({
    key: `course:${String(c.title || '').trim().toLowerCase()}`,
    title: String(c.title || '').trim(),
  })).filter((a) => a.title);
}

function getCompletedAssignmentKeys(member, curriculum, completedCourses, quizAssigned, quizCompleted) {
  const done = new Set();

  for (const item of curriculum || []) {
    const key = `course:${String(item.title || '').trim().toLowerCase()}`;
    const titleNorm = String(item.title || '').trim().toLowerCase();
    const hit = (completedCourses || []).some(
      (c) =>
        matchesMember(c, member) &&
        String(c.courseTitle || '').trim().toLowerCase() === titleNorm
    );
    if (hit) done.add(key);
  }

  for (const title of quizAssigned) {
    if (quizCompleted.has(title)) done.add(`quiz:${title}`);
  }

  return done;
}

function calculateTrainingScore(member, curriculum, completedCourses, quizAssigned, quizCompleted) {
  const courseAssignments = getCurriculumAssignments(curriculum);
  const totalAssigned = courseAssignments.length + quizAssigned.size;
  if (totalAssigned === 0) return 100;

  const completedKeys = getCompletedAssignmentKeys(
    member,
    curriculum,
    completedCourses,
    quizAssigned,
    quizCompleted
  );

  let completedCount = 0;
  for (const a of courseAssignments) {
    if (completedKeys.has(a.key)) completedCount += 1;
  }
  for (const title of quizAssigned) {
    if (quizCompleted.has(title)) completedCount += 1;
  }

  return Math.round((completedCount / totalAssigned) * 100);
}

function calculateIndividualKPI(trainingScore, ptwScore) {
  return Math.round(trainingScore * 0.5 + ptwScore * 0.5);
}

async function findPtwPersonForMember(member) {
  return findPtwPersonForUser({
    email: member.email,
    name: member.name,
    empId: member.empId,
  });
}

async function loadTrainingContext() {
  const config = await AdminConfig.findOne().lean();
  const curriculum = config?.curriculum || [];
  const completedCourses = config?.completedCourses || [];
  const notifications = await Notification.find({
    type: { $in: ['quiz_assigned', 'quiz_completed'] },
  })
    .select('type recipientUserId body metadata')
    .lean();
  return { curriculum, completedCourses, notifications };
}

async function scoreMember(member, context) {
  const { curriculum, completedCourses, notifications } = context;
  const userId = member._id;
  const quizAssigned = getQuizAssignmentsForUser(notifications, userId);
  const quizCompleted = getQuizCompletionsForUser(notifications, member.name);
  const trainingScore = calculateTrainingScore(
    member,
    curriculum,
    completedCourses,
    quizAssigned,
    quizCompleted
  );
  const ptwPerson = await findPtwPersonForMember(member);
  const ptwScore = calculatePtwScore(member, ptwPerson);
  const individualKPI = calculateIndividualKPI(trainingScore, ptwScore);

  const targetLevel = ptwTargetLevelForRole(member.role);
  const heldLevel = maxAuthLevel(ptwPerson);
  const merged = mergePtwWithRosterMember(ptwPerson, member);
  const expiry = computePtwExpiryInfo(ptwPerson?.validUntil);
  const email = resolveMemberEmail(member, ptwPerson);

  return {
    memberId: String(member._id),
    empId: member.empId,
    name: member.name,
    crew: member.crew,
    role: member.role,
    trainingScore,
    ptwScore,
    individualKPI,
    ptwStatus: targetLevel === null
      ? 'N/A'
      : heldLevel >= targetLevel
        ? 'met'
        : heldLevel > 0
          ? 'partial'
          : 'none',
    validUntil: expiry.validUntil,
    validUntilFormatted: expiry.validUntilFormatted,
    daysUntilExpiry: expiry.daysUntilExpiry,
    expiringWithin30: expiry.expiringWithin30,
    expiringWithin60: expiry.expiringWithin60,
    ptwExpired: expiry.expired,
    missingEmail: !email,
    rosterMismatch: merged.rosterMismatch,
    ptwAuthorizations: ptwPerson?.authorizations || [],
  };
}

async function getMemberKpiById(memberId) {
  const member = await AdminUser.findById(memberId)
    .select('_id empId name email crew role')
    .lean();
  if (!member) return null;
  const context = await loadTrainingContext();
  return scoreMember(member, context);
}

async function getAvailableCrewSet() {
  const config = await AdminConfig.findOne().lean();
  const crews = config?.availableCrews ?? ['A', 'B', 'C', 'D', 'General', 'S'];
  return new Set(
    crews.map((c) => String(c).trim()).filter(Boolean)
  );
}

async function getCrewKpi(crewId) {
  const crew = String(crewId || '').trim();
  const activeCrews = await getAvailableCrewSet();
  if (!activeCrews.has(crew)) {
    return { crewKPI: 0, members: [] };
  }

  const members = await AdminUser.find({
    crew,
    isApproved: true,
  })
    .select('_id empId name email crew role')
    .lean();

  if (!members.length) {
    return { crewKPI: 0, members: [] };
  }

  const context = await loadTrainingContext();
  const scored = await Promise.all(members.map((m) => scoreMember(m, context)));
  const sum = scored.reduce((acc, m) => acc + m.individualKPI, 0);
  const crewKPI = Math.round(sum / scored.length);

  return { crewKPI, members: scored };
}

async function getAllCrewKpis() {
  const activeCrews = await getAvailableCrewSet();
  const members = await AdminUser.find({ isApproved: true })
    .select('_id empId name email crew role')
    .lean();

  const byCrew = new Map();
  for (const m of members) {
    const c = String(m.crew || '').trim() || 'Unassigned';
    if (!activeCrews.has(c)) continue;
    if (!byCrew.has(c)) byCrew.set(c, []);
    byCrew.get(c).push(m);
  }

  const context = await loadTrainingContext();
  const crews = [];

  for (const [crew, crewMembers] of byCrew.entries()) {
    const scored = await Promise.all(crewMembers.map((m) => scoreMember(m, context)));
    const sum = scored.reduce((acc, m) => acc + m.individualKPI, 0);
    crews.push({
      crewId: crew,
      crewKPI: scored.length ? Math.round(sum / scored.length) : 0,
      members: scored,
    });
  }

  crews.sort((a, b) => a.crewId.localeCompare(b.crewId));
  return { crews };
}

function calculateGoalScore(member) {
  const goals = (member?.kpis || []).filter((k) => k && k.title);
  if (!goals.length) return null;
  const sum = goals.reduce((acc, k) => acc + (Number(k.progress) || 0), 0);
  return Math.round(sum / goals.length);
}

function calculateUnifiedScore(complianceScore, goalScore) {
  if (goalScore === null || goalScore === undefined) return complianceScore;
  return Math.round(complianceScore * 0.5 + goalScore * 0.5);
}

async function calculateUnifiedKPI(empId) {
  const member = await AdminUser.findOne({ empId: String(empId).trim() })
    .select('_id empId name email crew role kpis kpiSubmissionStatus')
    .lean();
  if (!member) return null;

  const compliance = await getMemberKpiById(member._id);
  if (!compliance) return null;

  const goalScore = calculateGoalScore(member);
  const unifiedKPI = calculateUnifiedScore(compliance.individualKPI, goalScore);

  return {
    ...compliance,
    goalScore,
    unifiedKPI,
    hasGoals: goalScore !== null,
    kpiSubmissionStatus: member.kpiSubmissionStatus || '',
  };
}

async function getCrewUnifiedKpi(crewId) {
  const crewResult = await getCrewKpi(crewId);
  const members = await Promise.all(
    crewResult.members.map(async (m) => {
      const memberDoc = await AdminUser.findById(m.memberId).select('kpis kpiSubmissionStatus').lean();
      const goalScore = calculateGoalScore(memberDoc);
      const unifiedKPI = calculateUnifiedScore(m.individualKPI, goalScore);
      return {
        ...m,
        goalScore,
        unifiedKPI,
        hasGoals: goalScore !== null,
      };
    })
  );
  const sum = members.reduce((acc, m) => acc + (m.unifiedKPI ?? m.individualKPI), 0);
  const crewUnifiedKPI = members.length ? Math.round(sum / members.length) : 0;
  return { crewUnifiedKPI, crewKPI: crewResult.crewKPI, members };
}

module.exports = {
  AUTH_LEVEL,
  ALL_AUTH_KEYS,
  normalizeRole,
  ptwTargetLevelForRole,
  maxAuthLevel,
  calculatePtwScore,
  calculateTrainingScore,
  calculateIndividualKPI,
  calculateGoalScore,
  calculateUnifiedScore,
  calculateUnifiedKPI,
  getMemberKpiById,
  getCrewKpi,
  getCrewUnifiedKpi,
  getAllCrewKpis,
  getAvailableCrewSet,
};
