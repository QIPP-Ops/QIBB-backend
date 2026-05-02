const mongoose = require('mongoose');

const LeaveSchema = new mongoose.Schema({
  start: { type: Date, required: true },
  end: { type: Date, required: true },
  type: { type: String, enum: ['Applied on SAP', 'Planned'], default: 'Planned' }
});

const AdminUserSchema = new mongoose.Schema({ // TODO: COSMOS_COMPAT_CHECK
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  name: { type: String, required: true },
  empId: { type: String, required: true, unique: true },
  crew: { type: String, required: true, enum: ['A', 'B', 'C', 'D', 'General', 'S'] },
  role: { type: String, required: true },
  color: { type: String, default: 'crew-grey' },
  leaves: [LeaveSchema],
  accessRole: { type: String, enum: ['admin', 'viewer'], default: 'viewer' }
}, { timestamps: true });

module.exports = mongoose.model('AdminUser', AdminUserSchema);
