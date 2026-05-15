const mongoose = require('mongoose');

const ptwSchema = new mongoose.Schema({
  permitId: { type: String, required: true, unique: true },
  type: { 
    type: String, 
    required: true,
    enum: ['Hot Work', 'Lifting', 'Confined Space', 'Working at Height', 'Diving', 'Live', 'Access', 'Standard', 'ROSH']
  },
  status: { 
    type: String, 
    required: true,
    enum: ['Prepared', 'Issued', 'Suspended', 'Closed'],
    default: 'Prepared'
  },
  location: { type: String, required: true },
  description: { type: String, required: true },
  issuedBy: { type: String, required: true }, // Name of the requestor
  authorizedBy: { type: String }, // Name of the admin who approved
  contractor: { type: String },
  validFrom: { type: Date, required: true },
  validTo: { type: Date, required: true }
}, { timestamps: true });

module.exports = mongoose.model('PTW', PTWSchema);
