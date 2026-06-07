const mongoose = require('mongoose');

const QuizAttemptSchema = new mongoose.Schema(
  {
    quizId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', required: true, index: true },
    userName: { type: String, default: '' },
    empId: { type: String, default: '' },
    score: { type: Number, required: true },
    maxScore: { type: Number, required: true },
    percent: { type: Number, required: true },
    passed: { type: Boolean, required: true },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: Date.now, index: true },
    answers: { type: mongoose.Schema.Types.Mixed, default: null },
    durationSeconds: { type: Number, default: null },
  },
  { timestamps: true }
);

QuizAttemptSchema.index({ quizId: 1, completedAt: -1 });
QuizAttemptSchema.index({ userId: 1, completedAt: -1 });

module.exports = mongoose.model('QuizAttempt', QuizAttemptSchema);
