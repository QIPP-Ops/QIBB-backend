const DailyOperation = require('../models/DailyOperation');

// Choose which collection model to use for "main" queries.
// Default to DailyOpSummary (plant-level data).
const Model = DailyOperation.DailyOpSummary;

exports.getLatest = async (req, res) => {
  try {
    const days = parseInt(req.query.days, 10) || 30;
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().slice(0, 10);

    const data = await Model.find({
      $or: [
        { report_date: { $gte: sinceStr } },
        { report_date: { $gte: since } }
      ]
    })
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
    const data = await Model.find({ report_date: date });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching daily operation data' });
  }
};

exports.getSummary = async (req, res) => {
  try {
    const days = parseInt(req.query.days, 10) || 30;
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().slice(0, 10);

    const data = await Model.aggregate([
      {
        $match: {
          $or: [
            { report_date: { $gte: sinceStr } },
            { report_date: { $gte: since } }
          ]
        }
      },
      {
        $group: {
          _id: '$report_date',
          avgProductionRate: { $avg: '$production_rate' },
          totalProduction:   { $sum: '$daily_production' },
          avgEfficiency:     { $avg: '$efficiency_percent' },
          count:             { $sum: 1 }
        }
      },
      { $sort: { _id: -1 } }
    ]);

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching daily operation summary' });
  }
};

exports.getKpis = async (req, res) => {
  try {
    const latest = await Model.findOne().sort({ report_date: -1 });
    if (!latest) {
      return res.status(404).json({ success: false, message: 'No data found' });
    }
    res.json({ success: true, data: latest });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching KPIs' });
  }
};
