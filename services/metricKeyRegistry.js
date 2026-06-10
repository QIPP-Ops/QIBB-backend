const fs = require('fs');
const path = require('path');

const REGISTRY_PATH = path.join(__dirname, '../data/metric-key-registry.json');

let cached = null;

function loadMetricKeyRegistry() {
  if (cached) return cached;
  const raw = fs.readFileSync(REGISTRY_PATH, 'utf8');
  cached = JSON.parse(raw);
  return cached;
}

function resetMetricKeyRegistryCache() {
  cached = null;
}

function kpiKeys(kpiId) {
  const row = loadMetricKeyRegistry().kpis?.[kpiId];
  return row?.keys ? [...row.keys] : [];
}

function chartKeys(chartId) {
  const row = loadMetricKeyRegistry().charts?.[chartId];
  return row?.keys ? [...row.keys] : [];
}

function managementKeys(panelId) {
  const row = loadMetricKeyRegistry().management?.[panelId];
  return row?.keys ? [...row.keys] : [];
}

function kpiMatchers() {
  const registry = loadMetricKeyRegistry();
  const out = {};
  for (const [id, row] of Object.entries(registry.kpis || {})) {
    out[id] = (row.patterns || []).map((p) => new RegExp(p, 'i'));
  }
  return out;
}

function patternSourcesForTrendSeeds() {
  const registry = loadMetricKeyRegistry();
  return {
    homeInsight: Object.entries(registry.kpis || {}).map(([suffix, row]) => ({
      suffix,
      title: row.label,
      patterns: (row.patterns || []).join('|'),
    })),
    homeKpi: Object.entries(registry.kpis || {})
      .filter(([suffix]) => ['gn', 'ld', 'pf', 'ef', 'hr', 'fu'].includes(suffix))
      .map(([suffix, row]) => ({
        suffix,
        patterns: (row.patterns || []).join('|'),
      })),
    homeCharts: Object.entries(registry.charts || {}).map(([id, row]) => ({
      id,
      title: row.label,
      patterns: (row.keys || []).slice(0, 6).join('|'),
    })),
    management: registry.management || {},
  };
}

module.exports = {
  REGISTRY_PATH,
  loadMetricKeyRegistry,
  resetMetricKeyRegistryCache,
  kpiKeys,
  chartKeys,
  managementKeys,
  kpiMatchers,
  patternSourcesForTrendSeeds,
};
