const AuditLog = require('../models/AuditLog');
const {
  buildAuditLogCrewFilter,
  mergeFilters,
} = require('../utils/logAccessPermissions');

exports.getAuditLog = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 200);
    const skip = (page - 1) * limit;

    const baseFilter = {};
    if (req.query.actorEmail) {
      baseFilter.actorEmail = String(req.query.actorEmail).trim().toLowerCase();
    }
    if (req.query.action) {
      baseFilter.action = String(req.query.action).trim();
    }
    if (req.query.targetType) {
      baseFilter.targetType = String(req.query.targetType).trim();
    }
    if (req.query.from || req.query.to) {
      baseFilter.timestamp = {};
      if (req.query.from) {
        baseFilter.timestamp.$gte = new Date(`${String(req.query.from).slice(0, 10)}T00:00:00.000Z`);
      }
      if (req.query.to) {
        baseFilter.timestamp.$lte = new Date(`${String(req.query.to).slice(0, 10)}T23:59:59.999Z`);
      }
    }

    const crewFilter = await buildAuditLogCrewFilter(req);
    const filter = mergeFilters(baseFilter, crewFilter);

    const [logs, total] = await Promise.all([
      AuditLog.find(filter).sort({ timestamp: -1 }).skip(skip).limit(limit).lean(),
      AuditLog.countDocuments(filter),
    ]);

    const pages = Math.max(Math.ceil(total / limit), 1);
    return res.json({ logs, total, page, pages });
  } catch (error) {
    if (error.status === 403) {
      return res.status(403).json({ message: error.message });
    }
    return res.status(500).json({ message: 'Failed to fetch audit logs', error: error.message });
  }
};
