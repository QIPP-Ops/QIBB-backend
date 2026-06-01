const AuditLog = require('../models/AuditLog');

exports.getAuditLog = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 200);
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.actorEmail) {
      filter.actorEmail = String(req.query.actorEmail).trim().toLowerCase();
    }
    if (req.query.action) {
      filter.action = String(req.query.action).trim();
    }
    if (req.query.targetType) {
      filter.targetType = String(req.query.targetType).trim();
    }
    if (req.query.from || req.query.to) {
      filter.timestamp = {};
      if (req.query.from) {
        filter.timestamp.$gte = new Date(`${String(req.query.from).slice(0, 10)}T00:00:00.000Z`);
      }
      if (req.query.to) {
        filter.timestamp.$lte = new Date(`${String(req.query.to).slice(0, 10)}T23:59:59.999Z`);
      }
    }

    const [logs, total] = await Promise.all([
      AuditLog.find(filter).sort({ timestamp: -1 }).skip(skip).limit(limit).lean(),
      AuditLog.countDocuments(filter),
    ]);

    const pages = Math.max(Math.ceil(total / limit), 1);
    return res.json({ logs, total, page, pages });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch audit logs', error: error.message });
  }
};
