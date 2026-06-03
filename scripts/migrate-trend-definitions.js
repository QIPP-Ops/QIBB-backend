#!/usr/bin/env node
/**
 * Idempotent migration: seed 44 TrendDefinitions from PANEL_DEFS / home / management seeds.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { getMongoUri } = require('../config/database');
const TrendDefinition = require('../models/TrendDefinition');
const TrendDisplayConfig = require('../models/TrendDisplayConfig');
const { TREND_DEFINITION_SEEDS } = require('../services/trends/trendDefinitionSeeds');

async function applyDisplayOverrides(seed, displayRows) {
  const hit = displayRows.find((r) => r.panelId === seed.panelId);
  if (!hit) return seed;
  return {
    ...seed,
    title: hit.displayName || hit.title || seed.title,
    metricSeries:
      hit.metricKeys?.length > 0
        ? hit.metricKeys.map((key, i) => ({
            key,
            label: hit.labels?.[key] || '',
            color: hit.colors?.[i] || '',
            aggregation: 'avg',
          }))
        : seed.metricSeries,
  };
}

async function main() {
  const uri = getMongoUri();
  if (!uri) {
    console.error('Set MONGODB_URI or COSMOS_URI');
    process.exit(1);
  }
  await mongoose.connect(uri, { retryWrites: false });

  const displayRows = await TrendDisplayConfig.find().lean();
  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const raw of TREND_DEFINITION_SEEDS) {
    const seed = await applyDisplayOverrides(raw, displayRows);
    const existing = await TrendDefinition.findOne({ panelId: seed.panelId });
    if (!existing) {
      await TrendDefinition.create(seed);
      created += 1;
      continue;
    }
    const before = JSON.stringify(existing.toObject());
    existing.set(seed);
    const after = JSON.stringify(existing.toObject());
    if (before !== after) {
      await existing.save();
      updated += 1;
    } else {
      unchanged += 1;
    }
  }

  const total = await TrendDefinition.countDocuments();
  console.log(
    `[migrate-trend-definitions] created=${created} updated=${updated} unchanged=${unchanged} total=${total}`
  );
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('[migrate-trend-definitions] failed:', err.message);
  process.exit(1);
});
