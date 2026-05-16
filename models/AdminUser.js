const mongoose = require('mongoose');

const LeaveSchema = new mongoose.Schema({
  start: { type: Date, required: true },
  end:   { type: Date, required: true },
  type: {
    type: String,
    enum: [
      'Annual Leave Plan', 'SAP Approved', 'Marriage Leave',
      'Maternity Leave', 'Sick Leave', 'Pilgrimage Leave',
      'Compassionate Leave', 'Compensate Leave', 'Academic Leave',
      'Applied on SAP', 'Planned'
    ],
    default: 'Planned'
  },
  workingDays: { type: Number },
  totalDays:   { type: Number }
});

const KpiGoalSchema = new mongoose.Schema({
  title:       { type: String, required: true },
  description: { type: String, default: '' },
  progress:    { type: Number, default: 0, min: 0, max: 100 },
  locked:      { type: Boolean, default: false },
  visible:     { type: Boolean, default: true },
  targetDate:  { type: Date },
  completedAt: { type: Date }
});

const AdminUserSchema = new mongoose.Schema({
  email:        { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  name:         { type: String, required: true },
  empId:        { type: String, required: true, unique: true },
  crew:         { type: String, required: true },
  role:         { type: String, required: true },
  color: {
    type: String,
    enum: [
      'crew-red', 'crew-yellow', 'crew-green',
      'crew-lightblue', 'crew-lightviolet',
      'crew-lightorange', 'crew-grey'
    ],
    default: 'crew-grey'
  },
  compensateBalance: { type: Number, default: 0 },
  leaves:            [LeaveSchema],
  accessRole:        { type: String, enum: ['admin', 'viewer', 'supervisor'], default: 'viewer' },
  isApproved:        { type: Boolean, default: false },
  kpis:              [KpiGoalSchema],
  kpiEditingAllowed: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.models.AdminUser ||
  mongoose.model('AdminUser', AdminUserSchema);
