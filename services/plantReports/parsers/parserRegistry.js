const path = require('path');
const { filenameMatchesPattern, patternSpecificity } = require('../fileMappingService');

/**
 * Parser registry: pick most specific parser for filename.
 * Specificity mirrors FileMapping logic: longer patterns with fewer * win.
 */

function normalizeBaseName(filename) {
  return path.basename(String(filename || '')).trim();
}

function buildRegistry() {
  // NOTE: patterns are glob-like, case-insensitive via filenameMatchesPattern.
  // Keep these aligned with the prompt’s “Operation*Shift*report*.xlsx” style.
  const parsers = [
    {
      id: 'parser1_operation_shift_report',
      display: 'Operation Shift Report',
      patterns: ['Operation*Shift*report*.xlsx'],
      load: () => require('./parser1_operationShiftReport'),
    },
    {
      id: 'parser2_ro_hrsg_report',
      display: 'RO-HRSG Report',
      patterns: ['RO*HRSG*Report*.xlsx'],
      load: () => require('./parser2_roHrsgReport'),
    },
    {
      id: 'parser3_gt_fuel_gas_filter_dp',
      display: 'GT Fuel Gas Filter DP',
      patterns: ['GTs*FG*filter*DP*.xlsx'],
      load: () => require('./parser3_gtFuelGasFilterDp'),
    },
    {
      id: 'parser4_gt_air_intake_filter_dp',
      display: 'GT Air Intake Filter DP',
      patterns: ['GTs*Air*Intake*Filter*DP*.xlsx', 'GTs*Air*Intake*Filter*DP*.xls*'],
      load: () => require('./parser4_gtAirIntakeFilterDp'),
    },
    {
      id: 'parser5_daily_water_consumption',
      display: 'Daily water consumption followup',
      patterns: ['*Daily*water*consumption*followup*.xlsx', '*Daily_water*consumption*.xlsx'],
      load: () => require('./parser5_dailyWaterConsumption'),
    },
    {
      id: 'parser6_daily_actual_energy_produced',
      display: 'Daily actual energy produced report',
      patterns: ['DAILY*ACTUAL*ENERGY*PRODUCED*REPORT*.xlsx'],
      load: () => require('./parser6_dailyActualEnergyProduced'),
    },
    {
      id: 'parser7_environment_report',
      display: 'Environment Report',
      patterns: ['Environment*Report*.xlsx'],
      load: () => require('./parser7_environmentReport'),
    },
    {
      id: 'parser8_timers_counters',
      display: 'Timers & Counters',
      patterns: ['TIMERS*COUNTERS*.xlsx', 'TIMERS-COUNTERS*.xlsx'],
      load: () => require('./parser8_timersCounters'),
    },
    {
      id: 'parser9_daily_operation_report',
      display: 'Daily Operation Report',
      patterns: ['Daily*Operation*Report*.xlsx'],
      load: () => require('./parser9_dailyOperationReport'),
    },
  ];

  // Expand into match records with specificity.
  const records = [];
  for (const p of parsers) {
    for (const pat of p.patterns || []) {
      records.push({
        parserId: p.id,
        display: p.display,
        pattern: pat,
        specificity: patternSpecificity(pat),
        load: p.load,
      });
    }
  }

  // Sort once: most specific first.
  records.sort((a, b) => b.specificity - a.specificity || String(b.pattern).length - String(a.pattern).length);

  function getParserForFilename(filename) {
    const base = normalizeBaseName(filename);
    if (!base) return null;
    const hit = records.find((r) => filenameMatchesPattern(base, r.pattern));
    if (!hit) return null;
    const mod = hit.load();
    return {
      id: hit.parserId,
      display: hit.display,
      pattern: hit.pattern,
      parse: mod.parse,
    };
  }

  return { getParserForFilename, records };
}

const registry = buildRegistry();

module.exports = {
  getParserForFilename: registry.getParserForFilename,
  _records: registry.records, // for tests
};

