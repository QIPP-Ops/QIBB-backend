const mongoose = require('mongoose');

const QuizSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    prizeDescription: { type: String, default: '', trim: true },
    prizeImageUrl: { type: String, default: '' },
    htmlStorageKey: { type: String, default: '' },
    /** Uploaded quiz HTML — persisted in MongoDB (survives Render redeploys). */
    htmlContent: { type: Buffer, default: null },
    prizeImageData: { type: Buffer, default: null },
    prizeImageMime: { type: String, default: '' },
    /** Frontend public path, e.g. /quizzes/NCHSESP-040-ptw-location-safety-quiz.html */
    staticHtmlUrl: { type: String, default: '' },
    catalogSlug: { type: String, default: '', trim: true, index: true },
    hubAccessible: { type: Boolean, default: false },
    passPercent: { type: Number, default: 80 },
    rewardQrEnabled: { type: Boolean, default: false },
    rewardQrUrl: { type: String, default: '' },
    rewardQrImageUrl: { type: String, default: '' },
    rewardTitle: { type: String, default: '' },
    rewardMessage: { type: String, default: '' },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    uploadedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

QuizSchema.index({ uploadedAt: -1 });

module.exports = mongoose.model('Quiz', QuizSchema);
