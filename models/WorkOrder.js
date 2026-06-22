const mongoose = require('mongoose');
const { WORK_ORDER_STATUSES, DEPARTMENTS } = require('../constants/qippLifecycle');

const workOrderSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, index: true },
  status: { type: String, required: true, enum: WORK_ORDER_STATUSES, index: true },
  prometheusStatusCode: { type: String, default: '' },
  equipmentCode: { type: String, default: '', index: true },
  description: { type: String, default: '' },
  equipmentDescription: { type: String, default: '' },
  plannedStart: { type: String, default: '' },
  plannedFinish: { type: String, default: '' },
  priority: { type: String, default: 'low' },
  prometheusPriorityCode: { type: String, default: '' },
  reportedBy: { type: String, default: '' },
  department: { type: String, enum: DEPARTMENTS, default: undefined, index: true },
  permitPackageId: { type: String, default: '', index: true },
  prometheusInternalId: { type: Number },
}, { timestamps: true });

module.exports = mongoose.model('WorkOrder', workOrderSchema);
