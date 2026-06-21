const mongoose = require('mongoose');

const LoginLogSchema = new mongoose.Schema(
  {
    timestamp: { type: Date, default: Date.now, index: true },
    email: { type: String, required: true, index: true },
    userId: { type: String, default: '' },
    userName: { type: String, default: '' },
    role: { type: String, default: '' },
    crew: { type: String, default: '' },
    success: { type: Boolean, required: true, index: true },
    failureCode: { type: String, default: '' },
    ipAddress: { type: String, default: '' },
    userAgent: { type: String, default: '' },
  },
  { timestamps: true }
);

LoginLogSchema.index({ timestamp: -1 });
LoginLogSchema.index({ email: 1, timestamp: -1 });
LoginLogSchema.index({ success: 1, timestamp: -1 });

module.exports = mongoose.model('LoginLog', LoginLogSchema);
