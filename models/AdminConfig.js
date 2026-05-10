const mongoose = require('mongoose');

const AchievementSchema = new mongoose.Schema({
  name: { type: String, required: true },
  course: { type: String, required: true },
  date: { type: Date, default: Date.now },
  icon: { type: String, default: 'award' },
  empId: { type: String, default: '' }
});

const KpiTemplateSchema = new mongoose.Schema({
  role: { type: String, required: true },
  goals: [{ type: String }]
});

const PtwPersonSchema = new mongoose.Schema({
  name: { type: String, required: true },
  designation: { type: String, default: '' },
  empNo: { type: String, default: '' },
  authorizations: [{ type: String }],
  validUntil: { type: String, default: '' },
  remarks: { type: String, default: '' },
});
// Add to AdminConfigSchema:
ptwPersonnel: [PtwPersonSchema],

const AdminConfigSchema = new mongoose.Schema({
  pinHash: { type: String, default: '' },
  editingLocked: { type: Boolean, default: false },
  availableCrews: {
    type: [String],
    default: ['A','B','C','D','General','S']
  },
  availableRoles: {
    type: [String],
    default: [
      'Shift in Charge Engineer','Supervisor','CCR Operator',
      'Local Operator','Field Operator','Management','Operations Support'
    ]
  },
  achievements: [AchievementSchema],
  kpiTemplates: [KpiTemplateSchema],
  globalKpiEditingAllowed: { type: Boolean, default: true },
  shiftCycleBaseDate: { type: String, default: '2026-01-01' }
}, { timestamps: true });

module.exports = mongoose.model('AdminConfig', AdminConfigSchema);