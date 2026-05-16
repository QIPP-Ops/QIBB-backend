const mongoose = require('mongoose');

const AchievementSchema = new mongoose.Schema({
  name:   { type: String, required: true },
  course: { type: String, required: true },
  date:   { type: Date, default: Date.now },
  icon:   { type: String, default: 'award' },
  empId:  { type: String, default: '' }
}, { _id: true });

const CurriculumItemSchema = new mongoose.Schema({
  category:    { type: String, required: true },
  title:       { type: String, required: true },
  description: { type: String, default: '' },
  link:        { type: String, default: '' },
  duration:    { type: String, default: '' },
}, { timestamps: true });

// Flexible PTW personnel schema — supports both the simple {empId,name,role,can...}
// format AND the matrix format {name,designation,empNo,authorizations[],...}
const PtwPersonnelSchema = new mongoose.Schema({
  name:           { type: String, required: true },
  designation:    { type: String, default: '' },
  empNo:          { type: String, default: '' },
  empId:          { type: String, default: '' },
  role:           { type: String, default: '' },
  crew:           { type: String, default: '' },
  department:     { type: String, default: '' },
  authorizations: { type: [String], default: [] },
  validUntil:     { type: String, default: '' },
  remarks:        { type: String, default: '' },
  canIssue:       { type: Boolean, default: false },
  canReceive:     { type: Boolean, default: false },
  canApprove:     { type: Boolean, default: false },
  canPerform:     { type: Boolean, default: false },
}, { timestamps: true, strict: false });

const KpiTemplateSchema = new mongoose.Schema({
  role:  { type: String, required: true },
  goals: [{ type: String }]
}, { _id: true });

const AdminConfigSchema = new mongoose.Schema({
  pinHash:        { type: String, default: '' },
  editingLocked:  { type: Boolean, default: false },
  availableCrews: {
    type: [String],
    default: ['A', 'B', 'C', 'D', 'General', 'S']
  },
  availableRoles: {
    type: [String],
    default: [
      'Shift in Charge Engineer',
      'Shift in Charge',
      'Supervisor',
      'CCR Operator',
      'Local Operator',
      'Field Operator',
      'Filed Operator',
      'Management',
      'Operations Support'
    ]
  },
  curriculum:              { type: [CurriculumItemSchema], default: [] },
  ptwPersonnel:            { type: [PtwPersonnelSchema],   default: [] },
  achievements:            { type: [AchievementSchema],    default: [] },
  kpiTemplates:            { type: [KpiTemplateSchema],    default: [] },
  globalKpiEditingAllowed: { type: Boolean, default: true },
  shiftCycleBaseDate:      { type: String,  default: '2026-01-01' }
}, { timestamps: true });

module.exports = mongoose.model('AdminConfig', AdminConfigSchema);
