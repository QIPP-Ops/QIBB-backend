const mongoose = require('mongoose');

const LeaveSchema = new mongoose.Schema({
  start:       { type: Date, required: true },
  end:         { type: Date, required: true },
  type:        { type: String, default: 'Planned' },
  appliedOnSap: { type: Boolean, default: false },
  'open-ended': {},
  workingDays: { type: Number },
  totalDays:   { type: Number },
});

const KpiGoalSchema = new mongoose.Schema({
  title:       { type: String, required: true },
  description: { type: String, default: '' },
  weight:      { type: Number, default: 0, min: 0, max: 100 },
  progress:    { type: Number, default: 0, min: 0, max: 100 },
  adminScore:  { type: Number, min: 0, max: 100 },
  locked:      { type: Boolean, default: false },
  visible:     { type: Boolean, default: true },
  targetDate:  { type: Date },
  completedAt: { type: Date },
});

const COLOR_VALUES = [
  'crew-red','crew-yellow','crew-green',
  'crew-lightblue','crew-lightviolet','crew-lightorange','crew-grey',
];

const AdminUserSchema = new mongoose.Schema({
  // ─── Core Identity ────────────────────────────────────────────────────────
  email:        { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  name:         { type: String, required: true },
  profilePhotoUrl: { type: String, default: '' },
  empId:        { type: String, required: true, unique: true },
  /** Canonical external / SAP employee ID (separate from internal empId). */
  employeeExternalId: { type: String, default: '' },
  /** Emergency Response Team member flag */
  isERT:        { type: Boolean, default: false },
  crew:         { type: String, required: true },
  role:         { type: String, required: true },
  color:        { type: String, enum: COLOR_VALUES, default: 'crew-grey' },
  seniority:    { type: String, enum: COLOR_VALUES, default: 'crew-grey' }, // backward compat alias

  // ─── Auth & Access ────────────────────────────────────────────────────────
  accessRole:        { type: String, enum: ['admin', 'viewer', 'management'], default: 'viewer' },
  /** Super-admin controlled: leave conflicts, chemistry alarms, daily digest */
  receiveEmailNotifications: { type: Boolean, default: false },
  canOpsLead:        { type: Boolean, default: false },
  /** Super-admin per-user portal tab visibility (missing key = visible). */
  tabVisibility:     { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  /** When true, user is omitted from leave timesheet / operations roster grids. */
  hiddenFromLeaveTimesheet: { type: Boolean, default: false },
  compensateDayBalance: { type: Number, default: 0 },
  annualLeaveBalance: { type: Number, default: 0 },
  bankLeaveBalance: { type: Number, default: 0 },
  annualLeaveAccrualRate: { type: Number, default: 0 },
  bankLeaveAccrualRate: { type: Number, default: 0 },
  /** Optional cap; unset = no cap */
  annualLeaveCap: { type: Number, default: null },
  bankLeaveCap: { type: Number, default: null },
  lastLeaveAccrualDate: { type: Date, default: null },
  isApproved:        { type: Boolean, default: false },
  /** When false, login is blocked (super-admin revoke). Defaults true for existing users. */
  isActive:          { type: Boolean, default: true },
  fullName:          { type: String, default: '' },
  position:          { type: String, default: '' },
  joiningDate:       { type: Date, default: null },
  nationality:       { type: String, default: '' },
  iqama:             { type: String, default: '' },
  employmentType:    { type: String, default: '' },
  company:           { type: String, default: '' },

  // ─── NEW: Email Verification ──────────────────────────────────────────────
  isEmailVerified:   { type: Boolean, default: false },
  otpHash:           { type: String, default: null },      // bcrypt hash of 6-digit OTP
  otpExpiresAt:      { type: Date,   default: null },      // OTP expiry timestamp

  // ─── NEW: Password Reset ──────────────────────────────────────────────────
  resetToken:        { type: String, default: null },      // hashed reset token
  resetTokenExpires: { type: Date,   default: null },      // reset link expiry

  // ─── Operation Team org chart (super-admin layout) ────────────────────────
  opsGroupLabel:      { type: String, default: '' },
  opsTreeParentEmpId: { type: String, default: '' },
  opsTreeRelation:    {
    type: String,
    enum: ['', 'root', 'child', 'above', 'below', 'beside'],
    default: '',
  },
  opsTreeOrder:       { type: Number, default: 0 },
  /** Local Operator → parent CCR Operator (empId) */
  assignedTo:         { type: String, default: '' },

  // ─── Operational Data ─────────────────────────────────────────────────────
  leaves:            [LeaveSchema],
  kpis:              [KpiGoalSchema],
  kpiEditingAllowed: { type: Boolean, default: true },
  kpiSubmissionStatus: {
    type: String,
    enum: ['draft', 'submitted', 'pending_final', 'reviewed'],
    default: 'draft',
  },
  kpiReviewNotes:  { type: String, default: '' },
  kpiSubmittedAt:  { type: Date, default: null },
  kpiReviewedAt:   { type: Date, default: null },
  kpiFinalApprovedAt: { type: Date, default: null },
  kpiFinalApprovedByEmpId: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('AdminUser', AdminUserSchema);
