const mongoose = require('mongoose');

const SafetyCaseCounterSchema = new mongoose.Schema({
  year: { type: Number, required: true, unique: true, index: true },
  seq: { type: Number, default: 0 },
});

module.exports = mongoose.model('SafetyCaseCounter', SafetyCaseCounterSchema);
