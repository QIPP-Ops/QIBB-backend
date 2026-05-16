const { GtAirFilter } = require('../models/GtFilter');

// Use GtAirFilter by default; FG filter has its own page if needed
const Model = GtAirFilter;

exports.getLatest = async (req, res) => {
  try {
    const days = parseInt(req.query.days, 10) || 30;
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().slice(0, 10);

    const data = await Model.find({
      $or: [
        { date: { $gte: sinceStr } },
        { date: { $gte: since } },
        { report_date: { $gte: sinceStr } },
        { report_date: { $gte: since } }
      ]
    })
      .sort({ date: -1, report_date: -1 })
      .limit(500);

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching GT filter data' });
  }
};

exports.getByDate = async (req, res) => {
  try {
    const { date } = req.query;
    const data = await Model.find({
      $or: [{ date }, { report_date: date }]
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching GT filter data' });
  }
};

exports.getUnitSummary = async (req, res) => {
  try {
    const days = parseInt(req.query.days, 10) || 30;
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().slice(0, 10);

    const data = await Model.aggregate([
      {
        $match: {
          $or: [
            { date: { $gte: sinceStr } },
            { date: { $gte: since } },
            { report_date: { $gte: sinceStr } },
            { report_date: { $gte: since } }
          ]
        }
      },
      {
        $group: {
          _id: { $ifNull: ['$gt', '$unit_number'] },
          avgDp:      { $avg: { $ifNull: ['$dp_dcs_mbar', '$differential_pressure'] } },
          maxDp:      { $max: { $ifNull: ['$dp_dcs_mbar', '$differential_pressure'] } },
          latestDate: { $max: { $ifNull: ['$date', '$report_date'] } },
          count:      { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching GT filter summary' });
  }
};
