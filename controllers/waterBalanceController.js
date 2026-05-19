const WaterBalance = require('../models/WaterBalance');

exports.getLatest = async (req, res) => {
  try {
    const days = parseInt(req.query.days, 10) || 30;
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().slice(0, 10);

    // Support both `date` (water ETL) and `report_date` (others)
    // and handle both string and Date storage
    const data = await WaterBalance.find({
      $or: [
        { report_date: { $gte: sinceStr } },
        { report_date: { $gte: since } },
        { date:        { $gte: sinceStr } },
        { date:        { $gte: since } }
      ]
    })
      .sort({ report_date: -1, date: -1 })
      .limit(500);

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getByDate = async (req, res) => {
  try {
    const target = req.query.date;
    if (!target) {
      return res.status(400).json({ success: false, message: 'Query parameter "date" is required (YYYY-MM-DD).' });
    }
    const data = await WaterBalance.find({
      $or: [{ report_date: target }, { date: target }]
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
