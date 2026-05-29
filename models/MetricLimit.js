const mongoose = require('mongoose');

const MetricLimitSchema = new mongoose.Schema(
  {
    metricKey: { type: String, required: true, unique: true, trim: true },
    label: { type: String, default: '' },
    unit: { type: String, default: '' },
    lowAlarm: { type: Number, default: null },
    lowWarning: { type: Number, default: null },
    highWarning: { type: Number, default: null },
    highAlarm: { type: Number, default: null },
    target: { type: Number, default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('MetricLimit', MetricLimitSchema);
