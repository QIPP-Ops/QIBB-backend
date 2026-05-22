const path = require('path');
const fs = require('fs');

let cached = null;

function loadDashboardData() {
  if (cached) return cached;
  const filePath = path.join(__dirname, '../data/qipp-safety-dashboard.json');
  const raw = fs.readFileSync(filePath, 'utf8');
  cached = JSON.parse(raw);
  return cached;
}

exports.getDashboard = async (req, res) => {
  try {
    res.json(loadDashboardData());
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to load PTW dashboard data' });
  }
};
