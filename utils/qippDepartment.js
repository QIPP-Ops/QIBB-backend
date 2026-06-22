const { DEPARTMENTS } = require('../constants/qippLifecycle');

/**
 * Department heuristic when Prometheus exports lack per-row department.
 *
 * Priority (first match wins):
 * 1. Instrument tags/keywords in equipment code or work text → IMD
 *    (TI, PI, FI, TT, PT, FT, TRANSMITTER, INSTRUMENT, ANALYZER, GAUGE)
 * 2. Electrical tags/keywords → EMD
 *    (ELE, ELEC, MCC, BKR, BREAKER, CABLE, TRANSFORMER, MOTOR starter panels,
 *     BAT, BATTERY, GENERATOR excitation, OT_ prefix on electrical work)
 * 3. Mechanical / rotating / piping → MMD (default for plant OT/ST units)
 *    (PUMP, VLV, VALVE, COMPRESSOR, TURBINE, CHLR, HEAT EXCH, COUPLING,
 *     ST30, ST10, ST60, OT20, OT30, mechanical overhaul keywords)
 *
 * Equipment tag prefixes like OT_ and ST30 usually denote operational-technology
 * plant areas; discipline is inferred from the work description when ambiguous.
 */
function inferDepartment(workDescription = '', equipmentCode = '', fallbackCode = '') {
  const text = `${workDescription} ${equipmentCode}`.toUpperCase();
  const tag = String(equipmentCode || fallbackCode || '').toUpperCase();

  const instrumentPatterns = [
    /\bTI[\d_]/, /\bPI[\d_]/, /\bFI[\d_]/, /\bTT[\d_]/, /\bPT[\d_]/, /\bFT[\d_]/,
    /TRANSMIT/, /INSTRUMENT/, /ANALYZ/, /GAUGE/, /INDICAT/, /SENSOR/,
    /IMD\b/, /INST\b/,
  ];
  if (instrumentPatterns.some((p) => p.test(text) || p.test(tag))) return 'IMD';

  const electricalPatterns = [
    /\bELE\b/, /ELECT/, /\bMCC\b/, /\bBKR\b/, /BREAKER/, /CABLE/, /TRANSFORMER/,
    /\bBAT\b/, /BATTERY/, /GENERATOR.*EXCIT/, /SWITCHGEAR/, /RELAY/, /PROTECTION/,
    /VOLTAGE/, /CURRENT.*TRANS/, /MOTOR.*STARTER/, /PANEL/, /PDC\b/, /SUBSTATION/,
    /\bEMD\b/,
  ];
  if (electricalPatterns.some((p) => p.test(text) || p.test(tag))) return 'EMD';

  const mechanicalPatterns = [
    /PUMP/, /VLV/, /VALVE/, /COMPRESSOR/, /TURBINE/, /CHLR/, /COUPLING/,
    /HEAT.?EXCH/, /BEARING/, /SEAL/, /OVERHAUL/, /MECHANICAL/, /LUBE OIL/,
    /\bMMD\b/, /ST30/, /ST10/, /ST60/, /OT20/, /OT30/, /^OT_/,
  ];
  if (mechanicalPatterns.some((p) => p.test(text) || p.test(tag))) return 'MMD';

  // Area codes OT_/ST## without clearer signal → MMD (mechanical maintenance default)
  if (/^OT_|ST\d{2}/.test(tag)) return 'MMD';

  if (!fallbackCode) return null;
  let hash = 0;
  for (let i = 0; i < String(fallbackCode).length; i += 1) {
    hash = (hash * 31 + String(fallbackCode).charCodeAt(i)) >>> 0;
  }
  return DEPARTMENTS[hash % DEPARTMENTS.length];
}

module.exports = { inferDepartment };
