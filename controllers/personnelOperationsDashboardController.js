const AdminUser = require('../models/AdminUser');
const SafetyObservation = require('../models/SafetyObservation');
const ShiftReport = require('../models/ShiftReport');
const { MONTHLY_MINIMUM } = require('../constants/safetyObservationOptions');
const QuizAssignment = require('../models/QuizAssignment');
const CourseAssignment = require('../models/CourseAssignment');
const ActingAssignment = require('../models/ActingAssignment');
const { listPendingSurveyAssignmentsForUser } = require('../controllers/surveyController');
const {
  assignmentRoleLabel,
  delegationStatus,
} = require('../services/actingCoverService');
const { fmtDate, getEmployeeDutyStatus } = require('../services/onDutyService');
const { canEditShiftReport } = require('../utils/rosterLeavePermissions');

function pendingQuizRows(assignments) {
  return assignments
    .filter((a) => a.quizId && !a.completedAt)
    .map((a) => ({
      assignmentId: a._id,
      quizId: a.quizId._id,
      title: a.quizId.title || 'Quiz',
      dueDate: a.dueDate || null,
      assignedAt: a.assignedAt || null,
    }));
}

function pendingCourseRows(assignments) {
  return assignments
    .filter((a) => !a.completedAt)
    .map((a) => ({
      assignmentId: a._id,
      courseId: a.courseId,
      title: a.courseTitle || a.courseId,
      dueDate: a.dueDate || null,
      assignedAt: a.createdAt || null,
    }));
}

function kpiSummaryFromUser(user) {
  const kpis = Array.isArray(user?.kpis) ? user.kpis.filter((k) => k.title) : [];
  const avgProgress =
    kpis.length > 0
      ? Math.round(kpis.reduce((sum, k) => sum + (Number(k.progress) || 0), 0) / kpis.length)
      : 0;
  return {
    goalCount: kpis.length,
    avgProgress,
    submissionStatus: user?.kpiSubmissionStatus || 'draft',
    goals: kpis.slice(0, 5).map((k) => ({
      title: k.title,
      progress: Number(k.progress) || 0,
      targetDate: k.targetDate || null,
    })),
  };
}

exports.getOperationsDashboard = async (req, res) => {
  try {
    const userId = req.user?.id;
    const empId = String(req.user?.empId || '').trim();
    if (!userId || !empId) {
      return res.status(400).json({ message: 'Employee session is incomplete.' });
    }

    const user = await AdminUser.findById(userId).select('-passwordHash').lean();
    if (!user) {
      return res.status(404).json({ message: 'Personnel not found.' });
    }

    const today = fmtDate();
    const duty = await getEmployeeDutyStatus(user, today);
    const canEdit = canEditShiftReport(req, user, duty);

    const monthKey = `${today.slice(0, 7)}`;
    const [reports, quizAssignments, courseAssignments, surveys, delegationDocs, safetyCount] = await Promise.all([
      ShiftReport.find({ empId, date: today }).sort({ shift: 1 }).lean(),
      QuizAssignment.find({ userId, completedAt: null })
        .sort({ dueDate: 1, assignedAt: -1 })
        .populate('quizId', 'title')
        .lean(),
      CourseAssignment.find({ userId, completedAt: null })
        .sort({ dueDate: 1, createdAt: -1 })
        .lean(),
      listPendingSurveyAssignmentsForUser(userId),
      ActingAssignment.find({ coverEmpId: empId, status: 'pending' })
        .sort({ requestedAt: 1 })
        .lean(),
      SafetyObservation.countDocuments({
        empId,
        observationMonth: monthKey,
        status: { $in: ['registered', 'pending_review', 'approved', 'pending', 'closed'] },
      }),
    ]);

    const absentIds = delegationDocs.map((d) => d.absentEmpId);
    const absentUsers = absentIds.length
      ? await AdminUser.find({ empId: { $in: absentIds } }).select('empId name').lean()
      : [];
    const absentById = new Map(absentUsers.map((u) => [u.empId, u]));
    const pendingDelegations = delegationDocs.map((d) => ({
      id: String(d._id),
      absentEmpId: d.absentEmpId,
      absentName: absentById.get(d.absentEmpId)?.name || d.absentEmpId,
      roleLabel: assignmentRoleLabel(d),
      crew: d.crew,
      startDate: d.startDate,
      endDate: d.endDate,
      notes: d.notes || '',
      status: delegationStatus(d),
      requestedAt: d.requestedAt || d.createdAt || null,
    }));

    const pendingQuizzes = pendingQuizRows(quizAssignments);
    const pendingCourses = pendingCourseRows(courseAssignments);
    const kpiSummary = kpiSummaryFromUser(user);

    const safetyRemaining = Math.max(0, MONTHLY_MINIMUM - safetyCount);
    const safetySummary = {
      count: safetyCount,
      minimum: MONTHLY_MINIMUM,
      metMinimum: safetyCount >= MONTHLY_MINIMUM,
      remaining: safetyRemaining,
    };

    const pendingCounts = {
      quizzes: pendingQuizzes.length,
      courses: pendingCourses.length,
      kpi: kpiSummary.goalCount,
      surveys: surveys.length,
      delegations: pendingDelegations.length,
      safetyObservations: safetyRemaining,
      total:
        pendingQuizzes.length +
        pendingCourses.length +
        surveys.length +
        pendingDelegations.length +
        safetyRemaining,
    };

    res.json({
      success: true,
      data: {
        empId,
        name: user.name,
        crew: user.crew,
        shiftReport: {
          date: today,
          duty,
          canEdit,
          submitted: reports.length > 0,
          report: reports[0] || null,
        },
        pendingQuizzes,
        pendingCourses,
        kpiSummary,
        safetySummary,
        surveys,
        pendingDelegations,
        pendingCounts,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
