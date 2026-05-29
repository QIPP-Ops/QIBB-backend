const mongoose = require('mongoose');

const QuizSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    prizeDescription: { type: String, required: true, trim: true },
    prizeImageUrl: { type: String, default: '' },
    htmlStorageKey: { type: String, required: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', required: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

QuizSchema.index({ uploadedAt: -1 });

module.exports = mongoose.model('Quiz', QuizSchema);
