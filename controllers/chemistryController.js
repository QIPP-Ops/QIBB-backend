const { getHistoryForParameter } = require('../services/chemistryHistoryService');

exports.getHistory = async (req, res) => {
  try {
    const parameter = String(req.query.parameter || '').trim();
    if (!parameter) {
      return res.status(400).json({ message: 'parameter query is required' });
    }
    const fromStr = String(req.query.from || '').trim().slice(0, 10);
    const toStr = String(req.query.to || '').trim().slice(0, 10);
    let since = null;
    let until = null;

    if (fromStr) {
      since = new Date(`${fromStr}T00:00:00.000Z`);
    } else {
      const days = Math.min(parseInt(req.query.days, 10) || 365, 1825);
      since = new Date();
      since.setDate(since.getDate() - days);
    }
    if (toStr) {
      until = new Date(`${toStr}T23:59:59.999Z`);
    }

    const rows = await getHistoryForParameter(parameter, { since, until, limit: 2000 });
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
