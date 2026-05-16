const EnergyHourly = require('../models/EnergyHourly');

exports.getLatest = async (req, res) => {
  try {
    const days = parseInt(req.query.days, 10) || 30;
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().slice(0, 10);

    const data = await EnergyHourly.find({
      $or: [
        { timestamp:   { $gte: since } },
        { date:        { $gte: sinceStr } },
        { date:        { $gte: since } },
        { report_date: { $gte: sinceStr } },
        { report_date: { $gte: since } }
      ]
    })
      .sort({ timestamp: -1, date: -1, report_date: -1 })
      .limit(500);

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching energy data' });
  }
};

exports.getByDate = async (req, res) => {
  try {
    const { date } = req.query;
    const data = await EnergyHourly.find({
      $or: [{ date }, { report_date: date }]
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching energy data' });
  }
};

exports.getSummary = async (req, res) => {
  try {
    const days = parseInt(req.query.days, 10) || 7;
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().slice(0, 10);

    const data = await EnergyHourly.aggregate([
      {
        $match: {
          $or: [
            { timestamp:   { $gte: since } },
            { date:        { $gte: sinceStr } },
            { report_date: { $gte: sinceStr } }
          ]
        }
      },
      {
        $group: {
          _id: {
            $ifNull: [
              '$date',
              { $ifNull: ['$report_date', { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } }] }
            ]
          },
          totalKwh: { $sum: { $ifNull: ['$kwh', '$actual_mwh'] } },
          avgPower: { $avg: { $ifNull: ['$power_kw', '$avail_decl_mw'] } },
          maxPower: { $max: { $ifNull: ['$power_kw', '$avail_decl_mw'] } }
        }
      },
      { $sort: { _id: -1 } }
    ]);

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching energy summary' });
  }
};
