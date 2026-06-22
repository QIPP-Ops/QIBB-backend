const path = require('path');
const fs = require('fs');
const WorkOrder = require('../models/WorkOrder');
const { buildDashboardPayload } = require('./qippEntityController');

let staticCached = null;

function loadStaticDashboardData() {
  if (staticCached) return staticCached;
  const filePath = path.join(__dirname, '../data/qipp-safety-dashboard.json');
  const raw = fs.readFileSync(filePath, 'utf8');
  staticCached = JSON.parse(raw);
  return staticCached;
}

function filterDashboardRows(data, department) {
  if (!department) return data;
  const filterRows = (rows) =>
    Array.isArray(rows)
      ? rows.filter((r) => !r.Department || r.Department === department)
      : rows;

  return {
    ...data,
    permits: filterRows(data.permits),
    supps: filterRows(data.supps),
    jha: filterRows(data.jha),
    work_assess: filterRows(data.work_assess),
    work_all: filterRows(data.work_all),
    iso: filterRows(data.iso),
    plant: filterRows(data.plant),
    locations: filterRows(data.locations),
    ks_keys: filterRows(data.ks_keys),
    ks_summary: filterRows(data.ks_summary),
    department,
  };
}

exports.getDashboard = async (req, res) => {
  try {
    const department = req.query.department || null;
    const woCount = await WorkOrder.estimatedDocumentCount().catch(() => 0);

    if (woCount > 0) {
      const payload = await buildDashboardPayload(department);
      return res.json(payload);
    }

    const staticData = loadStaticDashboardData();
    return res.json(filterDashboardRows({ ...staticData, source: 'static' }, department));
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to load PTW dashboard data' });
  }
};
