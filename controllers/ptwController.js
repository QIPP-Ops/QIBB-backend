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
    const permitData = req.body;
    // Generate a simple Permit ID if not provided (e.g. PTW-12345)
    if (!permitData.permitId) {
      permitData.permitId = `PTW-${Math.floor(1000 + Math.random() * 9000)}`;
    }
    const permit = new PTW(permitData);
    const newPermit = await permit.save();
    res.status(201).json(newPermit);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.updatePermitStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, authorizedBy } = req.body;
    
    const permit = await PTW.findByIdAndUpdate(
      id, 
      { status, authorizedBy }, 
      { new: true }
    );
    
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
