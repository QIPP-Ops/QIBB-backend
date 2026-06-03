const OpsShiftHighlight = require('../../models/OpsShiftHighlight');
const PlantMetricPoint = require('../../models/PlantMetricPoint');
const { PlantMetric } = require('../../models/PlantMetric');

async function upsertPoints(points) {
  let n = 0;
  const { evaluateMetricReading } = require('../chemistryAlarmService');
  for (const p of points) {
    if (p.value == null || !Number.isFinite(p.value)) continue;
    const displayLabel = p.displayName || p.label;
    const pointDoc = {
      ...p,
      label: displayLabel,
    };
    delete pointDoc.displayName;
    const res = await PlantMetricPoint.updateOne(
      {
        metricKey: p.metricKey,
        reportDate: p.reportDate,
        sourceFile: p.sourceFile,
        equipmentId: p.equipmentId || '',
        columnKey: p.columnKey || '',
      },
      { $set: pointDoc },
      { upsert: true }
    );
    if (res.upsertedCount || res.modifiedCount) n += 1;

    const { canonicalMetricKey, canonicalLabel } = require('./metricKeys');
    const ck = canonicalMetricKey(p.metricKey);
    if (/chem|ro|hrsg|ph|conductivity|silica|oxygen/i.test(ck) || p.category === 'chemistry') {
      evaluateMetricReading({
        metricKey: ck,
        label: canonicalLabel(displayLabel, p.metricKey),
        value: p.value,
        reportDate: p.reportDate,
      }).catch((err) => console.warn('[chem-alarm]', err.message));
    }
    const resolvedLabel = canonicalLabel(displayLabel, p.metricKey);
    await PlantMetric.updateOne(
      { metricKey: ck },
      {
        $set: {
          label: resolvedLabel,
          displayName: String(p.displayName || displayLabel || '').trim() || resolvedLabel,
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
