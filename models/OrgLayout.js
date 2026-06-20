const mongoose = require('mongoose');

const OrgLayoutNodeSchema = new mongoose.Schema(
  {
    empId: { type: String, required: true },
    parentEmpId: { type: String, default: '' },
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const OrgLayoutSchema = new mongoose.Schema(
  {
    crewId: { type: String, required: true, unique: true, index: true },
    manual: { type: Boolean, default: true },
    nodes: { type: [OrgLayoutNodeSchema], default: [] },
    updatedByEmail: { type: String, default: '' },
    updatedByName: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('OrgLayout', OrgLayoutSchema);
