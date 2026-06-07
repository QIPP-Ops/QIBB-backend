/** Normalize qipp-data blob JSON to flat { date, metric, value } rows (mirrors frontend trendBlobNormalize.ts). */

function extractRecordDate(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return '';
}

function isFlatTrendRecord(item) {
  if (!item || typeof item !== 'object') return false;
  return (
    typeof item.date === 'string' &&
    typeof item.metric === 'string' &&
    typeof item.value === 'number' &&
    Number.isFinite(item.value)
  );
}

function pushRow(out, date, metric, value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return;
  if (!date || !metric) return;
  out.push({ date: date.slice(0, 10), metric, value });
}

function unwrapBlobArray(raw) {
  if (raw == null) return [];
  if (typeof raw === 'object' && !Array.isArray(raw) && 'data' in raw) {
    return unwrapBlobArray(raw.data);
  }
  if (!Array.isArray(raw)) return [];
  return raw.filter((item) => item && typeof item === 'object');
}

function unitTagFromDailyOps(type, unitKey) {
  const num = String(unitKey || '').trim();
  if (!/^\d+$/.test(num)) return null;
  const kind = String(type || '').trim().toUpperCase();
  if (kind === 'GT' || kind === 'ST') {
    return `${kind}-${num.padStart(2, '0')}`;
  }
  const n = parseInt(num, 10);
  if (!Number.isFinite(n)) return null;
  return n % 10 === 0 ? `ST-${num.padStart(2, '0')}` : `GT-${num.padStart(2, '0')}`;
}

function normalizeDailyOpsBlob(raw) {
  const out = [];
  for (const row of unwrapBlobArray(raw)) {
    const date = extractRecordDate(row.date);
    if (!date) continue;

    if (typeof row.total_plant_load_mw === 'number') {
      pushRow(out, date, 'TOTAL PLANT LOAD IN MW', row.total_plant_load_mw);
    }

    const units = row.units;
    if (!units || typeof units !== 'object') continue;

    for (const [unitKey, unitRaw] of Object.entries(units)) {
      if (!unitRaw || typeof unitRaw !== 'object') continue;
      const unit = unitRaw;
      const tag = unitTagFromDailyOps(unit.type, unitKey);
      if (!tag) continue;

      pushRow(out, date, `Average From Timer Sheet_${tag}`, unit.avg_load_mw);
      pushRow(out, date, `Total Gen/Day (MWHR)_${tag}`, unit.total_gen_mwh);
      pushRow(out, date, `Today MFEQH (Hours)_${tag}`, unit.mfeqh_hours);
    }
  }
  return out;
}

const WATER_LABELS = {
  gr1_consumpt_m3: 'GR-1 Consumption (m³)',
  gr2_consumpt_m3: 'GR-2 Consumption (m³)',
  gr3_consumpt_m3: 'GR-3 Consumption (m³)',
  gr4_consumpt_m3: 'GR-4 Consumption (m³)',
  gr5_consumpt_m3: 'GR-5 Consumption (m³)',
  gr6_consumpt_m3: 'GR-6 Consumption (m³)',
  total_gr_consumpt_m3: 'Total GR Consumption (m³)',
  st1_level_m3: 'ST-1 Level (m³)',
  st2_level_m3: 'ST-2 Level (m³)',
  dt1_level_m3: 'DT-1 Level (m³)',
  dt2_level_m3: 'DT-2 Level (m³)',
  total_sw_prod_m3: 'Total SW Production (m³)',
  total_sw_consumpt_m3: 'Total SW Consumption (m³)',
  total_dm_prod_m3: 'Total DM Production (m³)',
  total_dm_consumpt_m3: 'Total DM Consumption (m³)',
  delta_sw_m3: 'Delta SW (m³)',
  delta_dw_m3: 'Delta DW (m³)',
};

function normalizeWaterBlob(raw) {
  const out = [];
  for (const row of unwrapBlobArray(raw)) {
    const date = extractRecordDate(row.date);
    if (!date) continue;
    for (const [key, value] of Object.entries(row)) {
      if (key === 'date' || key === 'source_file') continue;
      const metric = WATER_LABELS[key] ?? key.replace(/_/g, ' ');
      pushRow(out, date, metric, value);
    }
  }
  return out;
}

const STACK_PARAM_LABELS = {
  nox: 'NOx (mg/Nm³)',
  sox: 'SOx (mg/Nm³)',
  co: 'CO (mg/Nm³)',
  particulate: 'Particulate (mg/Nm³)',
  stack_temp_c: 'Stack Temp (°C)',
};

const STACK_SUB_LABELS = {
  min: 'Minimum',
  max: 'Maximum',
  avg: 'Average',
};

function normalizeGtTag(raw) {
  const match = String(raw || '').match(/GT#?(\d{2})/i);
  if (!match) return null;
  return `GT-${match[1]}`;
}

function normalizeEnvironmentBlob(raw) {
  const out = [];
  for (const row of unwrapBlobArray(raw)) {
    const date = extractRecordDate(row.date);
    if (!date) continue;

    const stack = row.stack_emissions;
    if (stack && typeof stack === 'object') {
      for (const [gtRaw, paramsRaw] of Object.entries(stack)) {
        const gt = normalizeGtTag(gtRaw);
        if (!gt || !paramsRaw || typeof paramsRaw !== 'object') continue;
        for (const [paramKey, subRaw] of Object.entries(paramsRaw)) {
          const paramLabel = STACK_PARAM_LABELS[paramKey] ?? paramKey;
          if (!subRaw || typeof subRaw !== 'object') continue;
          for (const [subKey, value] of Object.entries(subRaw)) {
            const subLabel = STACK_SUB_LABELS[subKey] ?? subKey;
            pushRow(out, date, `${paramLabel}_${gt}_${subLabel}`, value);
          }
        }
      }
    }

    const outfall = row.outfall;
    if (outfall && typeof outfall === 'object') {
      const flatLabels = {
        outfall_ph_south: 'Outfall pH (South)',
        outfall_ph_north: 'Outfall pH (North)',
        outfall_temp_south_c: 'Outfall Temp South (°C)',
        outfall_temp_north_c: 'Outfall Temp North (°C)',
      };
      for (const [key, value] of Object.entries(outfall)) {
        pushRow(out, date, flatLabels[key] ?? key.replace(/_/g, ' '), value);
      }
    }

    const ambient = row.ambient;
    if (ambient && typeof ambient === 'object') {
      const flatLabels = {
        ambient_temp_max_c: 'Ambient Temp Max (°C)',
        ambient_temp_min_c: 'Ambient Temp Min (°C)',
        ambient_rh_max_pct: 'Ambient RH Max (%)',
        ambient_rh_min_pct: 'Ambient RH Min (%)',
      };
      for (const [key, value] of Object.entries(ambient)) {
        const metric = flatLabels[key] ?? key.replace(/_/g, ' ');
        pushRow(out, date, metric, value);
      }
    }
  }
  return out;
}

const HRSG_SECTIONS = ['LP SH STEAM', 'HP SH STEAM', 'Condensate', 'HP Drum', 'LP Drum', 'BFW'];

function hrsgSectionFromField(field) {
  if (field.startsWith('lp_sh_steam_')) return 'LP SH STEAM';
  if (field.startsWith('hp_sh_steam_')) return 'HP SH STEAM';
  if (field.startsWith('condensate_')) return 'Condensate';
  if (field.startsWith('hp_drum_')) return 'HP Drum';
  if (field.startsWith('lp_drum_')) return 'LP Drum';
  if (field.startsWith('bfw_')) return 'BFW';
  return null;
}

function hrsgParameterFromField(field) {
  const stripped = field
    .replace(/^lp_sh_steam_/, '')
    .replace(/^hp_sh_steam_/, '')
    .replace(/^condensate_/, '')
    .replace(/^bfw_/, '')
    .replace(/^hp_drum_/, '')
    .replace(/^lp_drum_/, '');
  const labels = {
    ph: 'pH',
    sc_us_cm: 'SC (µS/cm)',
    cc_us_cm: 'CC (µS/cm)',
    do_ppb: 'DO (ppb)',
    po4_ppm: 'PO4 (ppm)',
    sio2_ppb: 'SiO2 (ppb)',
    na_ppb: 'Na (ppb)',
  };
  return labels[stripped] ?? stripped.replace(/_/g, ' ');
}

function hrsgUnitFromKey(unitKey, section) {
  const num = String(unitKey || '').trim();
  if (!/^\d+$/.test(num)) return null;
  if (section === 'Condensate' || section === 'BFW') {
    return `ST-${num.padStart(2, '0')}`;
  }
  return `GT-${num.padStart(2, '0')}`;
}

function normalizeHrsgBlob(raw) {
  const out = [];
  for (const row of unwrapBlobArray(raw)) {
    const date = extractRecordDate(row.date);
    if (!date) continue;
    const units = row.units;
    if (!units || typeof units !== 'object') continue;

    for (const [unitKey, unitRaw] of Object.entries(units)) {
      if (!unitRaw || typeof unitRaw !== 'object') continue;
      for (const [field, value] of Object.entries(unitRaw)) {
        const section = hrsgSectionFromField(field);
        if (!section) continue;
        const unit = hrsgUnitFromKey(unitKey, section);
        if (!unit) continue;
        const parameter = hrsgParameterFromField(field);
        pushRow(out, date, `${section}_${parameter}_${unit}`, value);
      }
    }
  }
  return out;
}

const FG_FIELD_LABELS = {
  load_mw: 'Load (MW)',
  bp_spread_bar: 'BP Spread (bar)',
  fg_sep_before_pr_bar: 'FG Sep Before PR (bar)',
  fg_sep_after_pr_bar: 'FG Sep After PR (bar)',
  stage_gas_pr_bar: 'Stage Gas PR (bar)',
  dp_at_dcs_bar: 'DP at DCS (bar)',
};

function normalizeFgFilterBlob(raw) {
  const out = [];
  for (const row of unwrapBlobArray(raw)) {
    const date = extractRecordDate(row.date);
    if (!date) continue;
    const gts = row.gts;
    if (!gts || typeof gts !== 'object') continue;
    for (const [gt, gtRaw] of Object.entries(gts)) {
      if (!gtRaw || typeof gtRaw !== 'object') continue;
      for (const [field, value] of Object.entries(gtRaw)) {
        const label = FG_FIELD_LABELS[field];
        if (!label) continue;
        pushRow(out, date, `${label}_${gt}`, value);
      }
    }
  }
  return out;
}

const AIR_FIELD_LABELS = {
  gt_mw: 'GT Load (MW)',
  pulse_air_press_mbar: 'Pulse Air Press (mbar)',
  p1c_mbar: 'P1C (mbar)',
  dp_at_dcs_mbar: 'DP at DCS (mbar)',
  dp_from_local_mbar: 'DP from Local (mbar)',
  inst_air_press_psig: 'Inst Air Press (psig)',
};

function normalizeAirIntakeBlob(raw) {
  const out = [];
  for (const row of unwrapBlobArray(raw)) {
    const date = extractRecordDate(row.date);
    if (!date) continue;
    const readings = row.readings;
    if (!Array.isArray(readings)) continue;
    for (const readingRaw of readings) {
      if (!readingRaw || typeof readingRaw !== 'object') continue;
      const reading = readingRaw;
      const gt = String(reading.gt || '').trim();
      if (!/^GT-\d{2}$/.test(gt)) continue;
      for (const [field, value] of Object.entries(reading)) {
        if (
          field === 'gt' ||
          field === 'remarks' ||
          field === 'prefilter_status' ||
          field === 'aux_compressor_status'
        ) {
          continue;
        }
        const label = AIR_FIELD_LABELS[field];
        if (!label) continue;
        pushRow(out, date, `${label}_${gt}`, value);
      }
    }
  }
  return out;
}

const NORMALIZERS = {
  daily_ops: normalizeDailyOpsBlob,
  water: normalizeWaterBlob,
  environment: normalizeEnvironmentBlob,
  hrsg: normalizeHrsgBlob,
  fg_filter: normalizeFgFilterBlob,
  air_inlet_filter: normalizeAirIntakeBlob,
};

const BLOB_FILE_KIND = {
  daily_ops: 'daily_ops',
  water: 'water',
  hrsg: 'hrsg',
  fg_filter: 'fg_filter',
  air_intake: 'air_inlet_filter',
  environment: 'environment',
};

function normalizeTrendBlobByKind(kind, raw) {
  const items = unwrapBlobArray(raw);
  if (items.length > 0 && isFlatTrendRecord(items[0])) {
    return items
      .filter(isFlatTrendRecord)
      .map((row) => ({
        date: row.date.slice(0, 10),
        metric: String(row.metric),
        value: Number(row.value),
      }))
      .filter((row) => row.date && row.metric && Number.isFinite(row.value));
  }
  const normalizer = NORMALIZERS[kind];
  return normalizer ? normalizer(raw) : [];
}

module.exports = {
  BLOB_FILE_KIND,
  normalizeTrendBlobByKind,
  normalizeDailyOpsBlob,
  normalizeWaterBlob,
  normalizeHrsgBlob,
  normalizeEnvironmentBlob,
  normalizeFgFilterBlob,
  normalizeAirIntakeBlob,
  unwrapBlobArray,
  isFlatTrendRecord,
};
