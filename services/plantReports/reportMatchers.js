const path = require('path');

function normalizeReportBasename(name) {
  return path
    .basename(name)
    .toLowerCase()
    .replace(/[_\s]+/g, ' ')
    .trim();
}

function matchesRoHrsgReport(name) {
  const n = normalizeReportBasename(name);
  return /ro[\s-]?hrsg/.test(n) || n.includes('ro hrsg');
}

function matchesWaterReport(name) {
  const n = normalizeReportBasename(name);
  return (
    n.includes('water consumption') ||
    n.includes('daily water') ||
    n.includes('water_consumption') ||
    n.includes('daily_water')
  );
}

function matchesEnergyReport(name) {
  const n = normalizeReportBasename(name);
  return (
    n.includes('energy produced') ||
    n.includes('energy-produced') ||
    n.includes('energy_produced') ||
    (n.includes('energy') && n.includes('report'))
  );
}

function matchesDailyOpsReport(name) {
  const n = normalizeReportBasename(name);
  return n.includes('daily operation report');
}

module.exports = {
  normalizeReportBasename,
  matchesRoHrsgReport,
  matchesWaterReport,
  matchesEnergyReport,
  matchesDailyOpsReport,
};
