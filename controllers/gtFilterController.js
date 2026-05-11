const GtFilter = require('../models/GtFilter');

exports.getLatest = async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const since = new Date();
    since.setDate(since.getDate() - days);
    const data = await GtFilter.find({ report_date: { $gte: since } })
      .sort({ report_date: -1 })
      .limit(500);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching GT filter data' });
  }
};

exports.getByDate = async (req, res) => {
  try {
    const { date } = req.query;
    const data = await GtFilter.find({ report_date: new Date(date) });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching GT filter data' });
  }
};

exports.getUnitSummary = async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const since = new Date();
    since.setDate(since.getDate() - days);
    const data = await GtFilter.aggregate([
      { $match: { report_date: { $gte: since } } },
      {
        $group: {
          _id: '$unit_number',
          avgDp: { $avg: '$differential_pressure' },
          maxDp: { $max: '$differential_pressure' },
          latestDate: { $max: '$report_date' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching GT filter summary' });
  }
};
