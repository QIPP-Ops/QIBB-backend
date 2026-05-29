const mongoose = require('mongoose');

const QuizAssignmentSchema = new mongoose.Schema(
  {
    quizId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', required: true, index: true },
    assignedAt: { type: Date, default: Date.now },
    dueDate: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    score: { type: Number, default: null },
  },
  { timestamps: true }
);

QuizAssignmentSchema.index({ quizId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('QuizAssignment', QuizAssignmentSchema);
