const OpsShiftHighlight = require('../../models/OpsShiftHighlight');
const PlantMetricPoint = require('../../models/PlantMetricPoint');
const { PlantMetric } = require('../../models/PlantMetric');
const { filterFutureMetricPoints } = require('./reportDateGuards');
const {
  canonicalMetricKey,
  canonicalLabel,
  deriveDisplayNameFromKey,
} = require('./metricKeys');

async function upsertPoints(points, options = {}) {
  const { kept, rejected } = filterFutureMetricPoints(points, options);
  if (rejected > 0 && options.log !== false) {
    console.warn(`[plant-ingest] rejected ${rejected} future PlantMetricPoint row(s)`);
  }

  let n = 0;
  const { evaluateMetricReading } = require('../chemistryAlarmService');
  for (const p of kept) {
    if (p.value == null || !Number.isFinite(p.value)) continue;
    const ck = canonicalMetricKey(p.metricKey);
    const displayLabel = String(p.displayName || p.label || '').trim() || deriveDisplayNameFromKey(ck);
    const pointDoc = {
      ...p,
      metricKey: ck,
      label: canonicalLabel(displayLabel, ck),
    };
    delete pointDoc.displayName;
    const res = await PlantMetricPoint.updateOne(
      {
        metricKey: ck,
        reportDate: p.reportDate,
        sourceFile: p.sourceFile,
        equipmentId: p.equipmentId || '',
        columnKey: p.columnKey || '',
      },
      { $set: pointDoc },
      { upsert: true }
    );
    if (res.upsertedCount || res.modifiedCount) n += 1;

    if (/chem|ro|hrsg|ph|conductivity|silica|oxygen/i.test(ck) || p.category === 'chemistry') {
      evaluateMetricReading({
        metricKey: ck,
        label: canonicalLabel(displayLabel, ck),
        value: p.value,
        reportDate: p.reportDate,
      }).catch((err) => console.warn('[chem-alarm]', err.message));
    }
    const resolvedLabel = canonicalLabel(displayLabel, ck);
    const resolvedDisplay =
      String(p.displayName || displayLabel || '').trim() || deriveDisplayNameFromKey(ck);
    await PlantMetric.updateOne(
      { metricKey: ck },
      {
        $set: {
          label: resolvedLabel,
          displayName: resolvedDisplay,
          category: p.category,
          unit: p.unit || '',
          sourceFilePattern: p.sourceFile,
          sheetName: p.sheetName || '',
          columnKey: p.columnKey || '',
        },
      },
      { upsert: true }
    );
  }
  return n;
}

async function processIngestResult(result) {
  let pointsUpserted = 0;
  let highlightsUpserted = 0;
  if (result.skipped) return { pointsUpserted, highlightsUpserted, kind: result.kind };

  pointsUpserted = await upsertPoints(result.points);
  const { filterOpsHighlights } = require('./opsHighlightFilter');
  for (const h of filterOpsHighlights(result.highlights || [])) {
    const res = await OpsShiftHighlight.updateOne(
      { sourceFile: h.sourceFile, reportDate: h.reportDate, text: h.text },
      { $set: h },
      { upsert: true }
    );
    if (res.upsertedCount || res.modifiedCount) highlightsUpserted += 1;
  }
  return { pointsUpserted, highlightsUpserted, kind: result.kind };
}

module.exports = { processIngestResult, upsertPoints };
