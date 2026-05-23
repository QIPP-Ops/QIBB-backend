const { getHistoryForParameter } = require('../services/chemistryHistoryService');

exports.getHistory = async (req, res) => {
  try {
    const parameter = String(req.query.parameter || '').trim();
    if (!parameter) {
      return res.status(400).json({ message: 'parameter query is required' });
    }
    const days = parseInt(req.query.days, 10) || 365;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const rows = await getHistoryForParameter(parameter, { since, limit: 2000 });
    res.json({
      success: true,
      parameter,
      data: rows.map((r) => ({
        value: r.value,
        unit: r.unit,
        tankName: r.tankName,
        timestamp: r.timestamp,
      })),
    });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching chemistry history', error: err.message });
  }
};
