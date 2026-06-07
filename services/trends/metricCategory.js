/** Canonical metric categories — kinds, not individual metric values. */
const METRIC_CATEGORIES = [
  'hrsg_chemistry',
  'environment',
  'fg_filter',
  'air_intake',
  'chillers',
  'water_consumption',
  'water_production',
  'tanks',
  'daily_ops',
  'energy',
  'timers_counters',
  'other',
];

function inferWaterCategory(metricKey, label) {
  const text = `${metricKey} ${label}`.toLowerCase();
  if (/tank|level/.test(text)) return 'tanks';
  if (/consumpt|usage|delta/.test(text)) return 'water_consumption';
  if (/prod|production|makeup/.test(text)) return 'water_production';
  return 'water_consumption';
}

function inferMetricCategory(metricKey, label = '', sourceKind = '') {
  const kind = String(sourceKind || '').toLowerCase();
  if (kind === 'hrsg') return 'hrsg_chemistry';
  if (kind === 'environment') return 'environment';
  if (kind === 'fg_filter') return 'fg_filter';
  if (kind === 'air_inlet_filter' || kind === 'air_intake') return 'air_intake';
  if (kind === 'water') return inferWaterCategory(metricKey, label);
  if (kind === 'daily_ops') return 'daily_ops';
  if (kind === 'energy') return 'energy';
  if (kind === 'timers_counters') return 'timers_counters';

  const text = `${metricKey} ${label}`.toLowerCase();
  if (/chiller|chw|cw_|cooling_water/.test(text)) return 'chillers';
  if (/tank|level|sw_tank|dm_tank/.test(text)) return 'tanks';
  if (/consumpt|usage|delta|gr-\d|gr\d/.test(text)) return 'water_consumption';
  if (/prod|production|sw_prod|dm_prod|makeup/.test(text)) return 'water_production';
  if (/hrsg|condensate|bfw|drum|steam|silica|conduct|ph|ro_|st_\d/.test(text)) {
    return 'hrsg_chemistry';
  }
  if (/nox|sox|co\b|emission|stack|ambient|particulate/.test(text)) return 'environment';
  if (/fg_filter|fg filter|fuel.?gas/.test(text)) return 'fg_filter';
  if (/air.?intake|p1c|inlet.?filter/.test(text)) return 'air_intake';
  if (/timer|counter|mfeqh|starts|trips/.test(text)) return 'timers_counters';
  if (/daily.?op|daily_op|shift|plant.?load/.test(text)) return 'daily_ops';
  if (/load|generation|fuel|heat|efficiency|mwh|mw\b|energy/.test(text)) return 'energy';
  return 'other';
}

module.exports = { METRIC_CATEGORIES, inferMetricCategory };
