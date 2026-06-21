const mongoose = require('mongoose');

const SAFETY_STATUSES = [
  'registered',
  'pending_review',
  'approved',
  'rejected',
  'closed',
  // legacy
  'pending',
];

const AttachmentSchema = new mongoose.Schema({
  id: { type: String, required: true },
  fileName: { type: String, default: '' },
  mimeType: { type: String, default: '' },
  sizeBytes: { type: Number, default: 0 },
  storageKey: { type: String, default: '' },
  url: { type: String, default: '' },
  uploadedBy: { type: String, default: '' },
  uploadedByName: { type: String, default: '' },
  uploadedAt: { type: Date, default: Date.now },
  kind: { type: String, enum: ['file', 'before_photo', 'after_photo'], default: 'file' },
}, { _id: false });

const CommentSchema = new mongoose.Schema({
  id: { type: String, required: true },
  authorId: { type: String, default: '' },
  authorName: { type: String, default: '' },
  text: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
}, { _id: false });

const ActionSchema = new mongoose.Schema({
  id: { type: String, required: true },
  text: { type: String, default: '' },
  createdBy: { type: String, default: '' },
  createdByName: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  completed: { type: Boolean, default: false },
}, { _id: false });

const LinkSchema = new mongoose.Schema({
  id: { type: String, required: true },
  url: { type: String, default: '' },
  label: { type: String, default: '' },
  createdBy: { type: String, default: '' },
  createdByName: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
}, { _id: false });

const ProcessingLogSchema = new mongoose.Schema({
  id: { type: String, required: true },
  at: { type: Date, default: Date.now },
  actorId: { type: String, default: '' },
  actorName: { type: String, default: '' },
  action: { type: String, default: '' },
  detail: { type: String, default: '' },
}, { _id: false });

const SafetyObservationSchema = new mongoose.Schema({
  caseNumber: { type: String, required: true, unique: true, index: true },
  empId: { type: String, required: true, index: true },
  employeeName: { type: String, default: '' },
  crew: { type: String, default: '', index: true },
  categories: { type: [String], default: [] },
  observedAt: { type: Date, default: Date.now },
  location: { type: String, default: '' },
  title: { type: String, required: true, maxlength: 4000 },
  description: { type: String, default: '', maxlength: 8000 },
  riskCategories: { type: [String], default: [] },
  potentialCauses: { type: [String], default: [] },
  stopWorkAuthority: { type: Boolean, default: false },
  howRevealed: { type: String, default: '' },
  workProcess: { type: String, default: '' },
  responsibleDepartment: { type: String, default: '' },
  reportedByDepartment: { type: String, default: '' },
  reportedByCompany: { type: String, default: '' },
  projectStatus: { type: String, default: '' },
  contactPerson: { type: String, default: '' },
  immediateActionTaken: { type: String, default: '' },
  dueDate: { type: Date, default: null },
  beforePhoto: { type: String, default: '' },
  afterPhoto: { type: String, default: '' },
  attachments: { type: [AttachmentSchema], default: [] },
  comments: { type: [CommentSchema], default: [] },
  actions: { type: [ActionSchema], default: [] },
  links: { type: [LinkSchema], default: [] },
  processingLog: { type: [ProcessingLogSchema], default: [] },
  status: {
    type: String,
    enum: SAFETY_STATUSES,
    default: 'registered',
    index: true,
  },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
  reviewedAt: { type: Date, default: null },
  reviewNotes: { type: String, default: '' },
  observationMonth: { type: String, required: true, index: true },
}, { timestamps: true });

SafetyObservationSchema.index({ empId: 1, observationMonth: 1 });
SafetyObservationSchema.index({ crew: 1, status: 1 });

module.exports = mongoose.model('SafetyObservation', SafetyObservationSchema);
module.exports.SAFETY_STATUSES = SAFETY_STATUSES;
