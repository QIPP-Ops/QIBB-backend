const PTW = require('../models/PTW');

exports.getAllPermits = async (req, res) => {
  try {
    const permits = await PTW.find().sort({ createdAt: -1 });
    res.json(permits);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createPermit = async (req, res) => {
  try {
    const permitData = { ...req.body };

    if (!permitData.permitId) {
      permitData.permitId = `PTW-${Date.now().toString().slice(-6)}`;
    }
    if (!permitData.status) {
      permitData.status = 'Pending';
    }
    if (!permitData.validFrom) {
      permitData.validFrom = new Date();
    }
    if (!permitData.validTo) {
      permitData.validTo = new Date(Date.now() + 8 * 60 * 60 * 1000);
    }

    const permit = new PTW(permitData);
    const saved = await permit.save();
    res.status(201).json(saved);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.updatePermitStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body || {};

    const permit = await PTW.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
    if (!permit) return res.status(404).json({ message: 'Permit not found' });
    res.json(permit);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deletePermit = async (req, res) => {
  try {
    const { id } = req.params;
    const permit = await PTW.findByIdAndDelete(id);
    if (!permit) return res.status(404).json({ message: 'Permit not found' });
    res.json({ message: 'Permit deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
