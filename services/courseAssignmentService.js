const CourseAssignment = require('../models/CourseAssignment');
const AdminUser = require('../models/AdminUser');
const { resolveAssignTargets } = require('./quizAssignmentService');

async function listCourseAssignments(courseId) {
  const rows = await CourseAssignment.find({ courseId: String(courseId) })
    .sort({ assignedAt: -1, createdAt: -1 })
    .populate('userId', 'name empId crew email')
    .lean();

  return rows.map((r) => ({
    id: r._id,
    userId: r.userId?._id,
    name: r.userId?.name,
    empId: r.empId || r.userId?.empId,
    crew: r.userId?.crew,
    email: r.userId?.email,
    courseTitle: r.courseTitle,
    dueDate: r.dueDate,
    completedAt: r.completedAt,
    assignedAt: r.createdAt,
    status: r.completedAt ? 'Completed' : 'Pending',
  }));
}

async function unassignCourse({ courseId, assignmentIds = [], userIds = [], crew }) {
  const filter = { courseId: String(courseId) };

  if (Array.isArray(assignmentIds) && assignmentIds.length) {
    filter._id = { $in: assignmentIds };
  } else if (Array.isArray(userIds) && userIds.length) {
    filter.userId = { $in: userIds };
  } else if (crew) {
    const crewUsers = await resolveAssignTargets({ crew });
    const crewUserIds = crewUsers.map((u) => u._id);
    if (!crewUserIds.length) {
      return { removed: 0, error: 'No approved members found for crew' };
    }
    filter.userId = { $in: crewUserIds };
  } else {
    return { removed: 0, error: 'Provide assignmentIds, userIds, or crew' };
  }

  const result = await CourseAssignment.deleteMany(filter);
  return { removed: result.deletedCount };
}

module.exports = {
  listCourseAssignments,
  unassignCourse,
};
