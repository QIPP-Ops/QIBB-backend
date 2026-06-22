const mongoose = require('mongoose');

const WORKFLOW_STATUSES = [
  'notification',
  'work_order',
  'jha',
  'ptw',
  'history',
  'cancelled',
];

const PtwWorkflowSchema = new mongoose.Schema(
  {
    workflowId: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: WORKFLOW_STATUSES,
      default: 'notification',
    },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    department: { type: String, default: '' },
    equipment: { type: String, default: '' },
    priority: { type: String, default: '' },
    location: { type: String, default: '' },
    workOrderNumber: { type: String, default: '' },
    jhaCode: { type: String, default: '' },
    permitId: { type: String, default: '' },
    raisedBy: { type: String, default: '' },
    raisedByEmail: { type: String, default: '' },
    archivedAt: { type: Date, default: null },
    history: [
      {
        at: { type: Date, default: Date.now },
        by: String,
        action: String,
        fromStatus: String,
        toStatus: String,
        note: String,
      },
    ],
  },
  { timestamps: true }
);

PtwWorkflowSchema.index({ status: 1, updatedAt: -1 });
PtwWorkflowSchema.index({ archivedAt: 1 });

module.exports = mongoose.model('PtwWorkflow', PtwWorkflowSchema);
module.exports.WORKFLOW_STATUSES = WORKFLOW_STATUSES;
