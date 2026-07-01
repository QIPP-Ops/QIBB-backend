const mongoose = require('mongoose');

const SafetyGiftCardGrantSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', required: true, index: true },
  empId: { type: String, required: true, index: true },
  tierId: { type: String, required: true, index: true },
  granted: { type: Boolean, default: false },
  grantedAt: { type: Date, default: null },
  grantedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
  grantedByName: { type: String, default: '' },
  notes: { type: String, default: '' },
}, { timestamps: true });

SafetyGiftCardGrantSchema.index({ empId: 1, tierId: 1 }, { unique: true });

module.exports = mongoose.model('SafetyGiftCardGrant', SafetyGiftCardGrantSchema);
