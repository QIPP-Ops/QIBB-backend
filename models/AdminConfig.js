const mongoose = require('mongoose');

const AdminConfigSchema = new mongoose.Schema({
  pinHash: { type: String, required: true },
  editingLocked: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('AdminConfig', AdminConfigSchema);
