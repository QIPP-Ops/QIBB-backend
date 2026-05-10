const mongoose = require('mongoose');

const LeaveSchema = new mongoose.Schema({
  start: { type: Date, required: true },
  end: { type: Date, required: true },
  type: { type: String, enum: ['Applied on SAP', 'Planned'], default: 'Planned' }
});

const KpiGoalSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  progress: { type: Number, default: 0, min: 0, max: 100 },
  locked: { type: Boolean, default: false },
  visible: { type: Boolean, default: true },
  targetDate: { type: Date },
  completedAt: { type: Date }
});

const AdminUserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  name: { type: String, required: true },
  empId: { type: String, required: true, unique: true },
  crew: { type: String, required: true },
  role: { type: String, required: true },
  seniority: {
    type: String,
    enum: ['crew-red','crew-yellow','crew-green','crew-lightblue','crew-lightviolet','crew-lightorange','crew-grey'],
    default: 'crew-grey'
  },
  leaves: [LeaveSchema],
  accessRole: { type: String, enum: ['admin', 'viewer'], default: 'viewer' },
  isApproved: { type: Boolean, default: false },
  kpis: [KpiGoalSchema],
  kpiEditingAllowed: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('AdminUser', AdminUserSchema);