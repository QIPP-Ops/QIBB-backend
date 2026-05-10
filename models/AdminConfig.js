const mongoose = require('mongoose');

const AchievementSchema = new mongoose.Schema({
  name: { type: String, required: true },
  course: { type: String, required: true },
  date: { type: Date, default: Date.now },
  icon: { type: String, default: 'award' },
  empId: { type: String, default: '' }
});
const mongoose = require('mongoose');

const CurriculumItemSchema = new mongoose.Schema({
  category:    { type: String, required: true },
  title:       { type: String, required: true },
  description: { type: String, default: "" },
  link:        { type: String, default: "" },
  duration:    { type: String, default: "" },
}, { timestamps: true });

const PtwPersonnelSchema = new mongoose.Schema({
  empId:       { type: String, required: true },
  name:        { type: String, required: true },
  role:        { type: String, required: true },
  crew:        { type: String, default: "" },
  canIssue:    { type: Boolean, default: false },
  canReceive:  { type: Boolean, default: false },
  canApprove:  { type: Boolean, default: false },
  canPerform:  { type: Boolean, default: false },
}, { timestamps: true });

const AdminConfigSchema = new mongoose.Schema({
  pinHash:          { type: String, default: "" },
  editingLocked:    { type: Boolean, default: false },
  availableCrews:   { type: [String], default: ["A", "B", "C", "D", "General", "S"] },
  availableRoles:   { type: [String], default: [
    "Shift in Charge Engineer",
    "Supervisor",
    "CCR Operator",
    "Local Operator",
    "Field Operator",
    "Management",
    "Operations Support"
  ]},
  curriculum:       { type: [CurriculumItemSchema], default: [] },
  ptwPersonnel:     { type: [PtwPersonnelSchema],   default: [] },
}, { timestamps: true });

module.exports = mongoose.model('AdminConfig', AdminConfigSchema);
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