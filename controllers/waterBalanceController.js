const WaterBalance = require('../models/WaterBalance');

exports.getLatest = async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const since = new Date();
    since.setDate(since.getDate() - days);
    const data = await WaterBalance.find()
      .sort({ report_date: -1 })
      .limit(500);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getByDate = async (req, res) => {
  try {
    const data = await WaterBalance.find({ report_date: req.params.date });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};