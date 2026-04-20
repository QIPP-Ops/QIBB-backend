const mongoose = require('mongoose');

const AdminUserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['admin', 'viewer'], default: 'viewer' }
}, { timestamps: true });

module.exports = mongoose.model('AdminUser', AdminUserSchema);
