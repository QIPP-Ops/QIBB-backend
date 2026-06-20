const mongoose = require('mongoose');

const SurveyAssignmentSchema = new mongoose.Schema(
  {
    surveyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Survey', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', required: true, index: true },
    dueDate: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    responses: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

SurveyAssignmentSchema.index({ surveyId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('SurveyAssignment', SurveyAssignmentSchema);
