const mongoose = require('mongoose');
const { PERMIT_TYPE_LABELS, PERMIT_STATUSES, JHA_STATUSES } = require('../constants/permitTypes');

const ptwSchema = new mongoose.Schema({
  permitId: { type: String, required: true, unique: true },
  type: { type: String, required: true, enum: PERMIT_TYPE_LABELS },
  status: {
    type: String,
    required: true,
    enum: PERMIT_STATUSES,
    default: 'ready_to_prepare',
  },
  location: { type: String, required: true },
  description: { type: String, required: true },
  workOrderNumber: { type: String, default: '' },
  contractor: { type: String, default: '' },
  validFrom: { type: Date, required: true },
  validTo: { type: Date, required: true },
  createdBy: { type: String, required: true },
  createdByEmail: { type: String, default: '' },
  permitReceivers: [{ type: String }],
  issuedBy: { type: String, default: '' },
  issuedByEmail: { type: String, default: '' },
  authorizedBy: { type: String, default: '' },
  jhaStatus: {
    type: String,
    enum: JHA_STATUSES,
    default: 'not_started',
  },
  jhaSubmittedAt: { type: Date },
  jhaApprovedAt: { type: Date },
  jhaApprovedBy: { type: String, default: '' },
  jhaNotes: { type: String, default: '' },
  history: [{
    at: { type: Date, default: Date.now },
    by: String,
    action: String,
    fromStatus: String,
    toStatus: String,
    note: String,
  }],
}, { timestamps: true, strict: false });

module.exports = mongoose.model('PTW', ptwSchema);
