const DailyOperation = require('../models/DailyOperation');

exports.getLatest = async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const since = new Date();
    since.setDate(since.getDate() - days);
    const data = await DailyOperation.find({ report_date: { $gte: since } })
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
    const data = await DailyOperation.find({ report_date: new Date(date) });
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
    const data = await DailyOperation.aggregate([
      { $match: { report_date: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$report_date' } },
          avgProductionRate: { $avg: '$production_rate' },
          totalProduction: { $sum: '$daily_production' },
          avgEfficiency: { $avg: '$efficiency_percent' },
          count: { $sum: 1 },
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
    const latest = await DailyOperation.findOne().sort({ report_date: -1 });
    if (!latest) return res.status(404).json({ success: false, message: 'No data found' });
    res.json({ success: true, data: latest });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching KPIs' });
  }
};
