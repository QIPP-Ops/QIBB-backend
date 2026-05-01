const SafetyPermit = require('../models/SafetyPermit');
const SafetyJha = require('../models/SafetyJha');
const WorkOrder = require('../models/WorkOrder');
const LotoKeySafe = require('../models/LotoKeySafe');
const IsolationPoint = require('../models/IsolationPoint');
const SafetyStats = require('../models/SafetyStats');

exports.getSafetyDashboard = async (req, res) => {
  try {
    const stats = await SafetyStats.findOne().sort({ createdAt: -1 });
    const permitsCount = await SafetyPermit.countDocuments();
    const jhaCount = await SafetyJha.countDocuments();
    const woCount = await WorkOrder.countDocuments();
    const lotoCount = await LotoKeySafe.countDocuments();
    const isoCount = await IsolationPoint.countDocuments();

    res.json({
      stats,
      counts: {
        permits: permitsCount,
        jha: jhaCount,
        workOrders: woCount,
        loto: lotoCount,
        isolationPoints: isoCount
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getAllPermits = async (req, res) => {
  try {
    const permits = await SafetyPermit.find().sort({ createdAt: -1 });
    res.json(permits);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getJhas = async (req, res) => {
  try {
    const jhas = await SafetyJha.find().sort({ jhaNo: 1 });
    res.json(jhas);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getWorkOrders = async (req, res) => {
  try {
    const { type } = req.query; // 'assess' or 'all'
    const query = type ? { type } : {};
    const wos = await WorkOrder.find(query).sort({ woNo: 1 });
    res.json(wos);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getLotoSafes = async (req, res) => {
  try {
    const safes = await LotoKeySafe.find().sort({ keySafeNo: 1 });
    res.json(safes);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getIsolationPoints = async (req, res) => {
  try {
    const isos = await IsolationPoint.find().sort({ isolationPointNo: 1 });
    res.json(isos);
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
    const permit = new SafetyPermit(permitData);
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
    
    const permit = await SafetyPermit.findByIdAndUpdate(
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
    const permit = await SafetyPermit.findByIdAndDelete(id);
    if (!permit) return res.status(404).json({ message: 'Permit not found' });
    res.json({ message: 'Permit deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
