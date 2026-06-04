const {
  matchesRoHrsgReport,
  matchesWaterReport,
  matchesEnergyReport,
  matchesDailyOpsReport,
} = require('./reportMatchers');
const {
  parseWaterConsumption,
  parseEnergyReport,
  parseROHRSGReport,
  parseDailyOperationReport,
  parseGtFilterDP,
} = require('../../reportParser');

/** Latest blob per report family → structured TrendsSnapshot fields */
const SNAPSHOT_PICKERS = [
  {
    field: 'water',
    match: matchesWaterReport,
    parse: parseWaterConsumption,
  },
  {
    field: 'energy',
    match: matchesEnergyReport,
    parse: parseEnergyReport,
  },
  {
    field: 'chemistry',
    match: matchesRoHrsgReport,
    parse: parseROHRSGReport,
  },
  {
    field: 'dailyOps',
    match: matchesDailyOpsReport,
    parse: parseDailyOperationReport,
  },
  {
    field: 'airFilterDP',
    match: (name) => /air intake filter/i.test(name),
    parse: (buf) => parseGtFilterDP(buf, 'air'),
  },
  {
    field: 'fgFilterDP',
    match: (name) => /fg filter|fg-filter/i.test(name),
    parse: (buf) => parseGtFilterDP(buf, 'fuel'),
  },
];

/** Subset used for dated backfill (chemistry/water history) */
const BACKFILL_FIELD_PICKERS = SNAPSHOT_PICKERS.filter((p) =>
  ['water', 'energy', 'chemistry', 'dailyOps'].includes(p.field)
);

module.exports = { SNAPSHOT_PICKERS, BACKFILL_FIELD_PICKERS };
