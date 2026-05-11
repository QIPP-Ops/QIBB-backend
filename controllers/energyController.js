const EnergyHourly = require('../models/EnergyHourly');

exports.getLatest = async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const since = new Date();
    since.setDate(since.getDate() - days);
    const data = await EnergyHourly.find({ timestamp: { $gte: since } })
      .sort({ timestamp: -1 })
      .limit(500);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching energy data' });
  }
};

exports.getByDate = async (req, res) => {
  try {
    const { date } = req.query;
    const start = new Date(date);
    const end = new Date(date);
    end.setDate(end.getDate() + 1);
    const data = await EnergyHourly.find({ timestamp: { $gte: start, $lt: end } });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching energy data' });
  }
};

exports.getSummary = async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const since = new Date();
    since.setDate(since.getDate() - days);
    const data = await EnergyHourly.aggregate([
      { $match: { timestamp: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
          totalKwh: { $sum: '$kwh' },
          avgPower: { $avg: '$power_kw' },
          maxPower: { $max: '$power_kw' },
        },
      },
      { $sort: { _id: -1 } },
    ]);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error fetching energy summary' });
  }
};
