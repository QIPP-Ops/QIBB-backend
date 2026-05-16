const mongoose = require('mongoose');

const ptwSchema = new mongoose.Schema({
  permitId:     { type: String, required: true, unique: true },
  type: {
    type: String,
    required: true,
    enum: [
      'Hot Work', 'Cold Work', 'Lifting', 'Confined Space',
      'Working at Height', 'Diving', 'Live', 'Access',
      'Standard', 'ROSH', 'Electrical Isolation', 'General'
    ]
  },
  status: {
    type: String,
    required: true,
    enum: ['Prepared', 'Pending', 'Issued', 'Active', 'Suspended', 'Closed'],
    default: 'Pending'
  },
  location:     { type: String, required: true },
  description:  { type: String, required: true },
  issuedBy:     { type: String, required: true },
  authorizedBy: { type: String },
  contractor:   { type: String },
  validFrom:    { type: Date, required: true },
  validTo:      { type: Date, required: true }
}, { timestamps: true });

module.exports = mongoose.models.PTW || mongoose.model('PTW', ptwSchema);
