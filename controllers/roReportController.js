const RoReport = require('../models/RoReport');

exports.getAllReports = async (req, res) => {
  try {
    const reports = await RoReport.find().sort({ reportDate: -1, shift: 1 });
    res.json(reports);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getReportById = async (req, res) => {
  try {
    const report = await RoReport.findById(req.params.id);
    if (!report) return res.status(404).json({ message: 'Report not found' });
    res.json(report);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getLatestReport = async (req, res) => {
  try {
    const report = await RoReport.findOne().sort({ reportDate: -1, shift: -1 });
    res.json(report);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
