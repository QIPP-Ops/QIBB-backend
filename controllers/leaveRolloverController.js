const { runYearEndRollover } = require('../services/leaveRolloverService');

exports.postLeaveRollover = async (req, res) => {
  try {
    const confirm = String(req.headers['x-confirm-rollover'] || '').toLowerCase();
    const dryRun = req.query.dryRun === 'true';
    const year = Number(req.body?.year);
    if (!year || year < 2000 || year > 2100) {
      return res.status(400).json({ message: 'Valid year is required (2000–2100).' });
    }
    if (!dryRun && confirm !== 'yes') {
      return res.status(400).json({
        message: 'Year-end rollover requires header X-Confirm-Rollover: yes',
      });
    }

    const result = await runYearEndRollover(year, {
      dryRun,
      performedBy: req.user?.empId || 'super_admin',
    });

    res.json({
      message: dryRun ? 'Year-end rollover preview generated.' : 'Year-end rollover completed.',
      ...result,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
