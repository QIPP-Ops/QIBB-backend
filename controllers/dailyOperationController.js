const DailyOperation = require('../models/DailyOperation');

exports.getLatest = async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const since = new Date();
    since.setDate(since.getDate() - days);
    const Model = DailyOperation.DailyOpSummary || DailyOperation;
    const data = await Model.find({ report_date: { $gte: since.toISOString().split('T')[0] } })
      .sort({ report_date: -1 })
      .limit(200);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching daily operation data' });
  }
};

exports.getByDate = async (req, res) => {
  try {
    const { date } = req.query;
    const Model = DailyOperation.DailyOpSummary || DailyOperation;
    const data = await Model.find({ report_date: date });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching daily operation data' });
  }
};

exports.getSummary = async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const since = new Date();
    since.setDate(since.getDate() - days);
    const Model = DailyOperation.DailyOpSummary || DailyOperation;
    const data = await Model.aggregate([
      { $match: { report_date: { $gte: since.toISOString().split('T')[0] } } },
      {
        $group: {
          _id: '$report_date',
          avgProductionRate: { $avg: '$production_rate' },
          totalProduction:   { $sum: '$daily_production' },
          avgEfficiency:     { $avg: '$efficiency_percent' },
          count:             { $sum: 1 },
        },
      },
      { $sort: { _id: -1 } },
    ]);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching daily operation summary' });
  }
};

exports.getKpis = async (req, res) => {
  try {
    const Model = DailyOperation.DailyOpSummary || DailyOperation;
    const latest = await Model.findOne().sort({ report_date: -1 });
    if (!latest) return res.json({ success: true, data: null });
    res.json({ success: true, data: latest });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching KPIs' });
  }
};
