const mongoose = require('mongoose');

const CourseAssignmentSchema = new mongoose.Schema(
  {
    courseId: { type: String, required: true, index: true },
    courseTitle: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', required: true, index: true },
    empId: { type: String, default: '', index: true },
    dueDate: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    lastReminderAt: { type: Date, default: null },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
  },
  { timestamps: true }
);

CourseAssignmentSchema.index({ courseId: 1, userId: 1 }, { unique: true });
CourseAssignmentSchema.index({ dueDate: 1, completedAt: 1 });

module.exports = mongoose.model('CourseAssignment', CourseAssignmentSchema);
