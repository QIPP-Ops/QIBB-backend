const TrendDisplayConfig = require('../models/TrendDisplayConfig');
const { PlantMetric } = require('../models/PlantMetric');
const mongoose = require('mongoose');
const { logAction } = require('../services/auditLogService');
const AUDIT_ACTIONS = require('../constants/auditActions');

const SINGLETON_KEY = 'default';

async function loadConfig() {
  if (mongoose.connection.readyState !== 1) {
    return {
      panels: [],
      customTrends: [],
      metricLabels: {},
      save: async () => {},
      _id: null,
    };
  }
  let doc = await TrendDisplayConfig.findOne({ singleton: SINGLETON_KEY });
  if (!doc) {
    doc = await TrendDisplayConfig.create({ singleton: SINGLETON_KEY });
  }
  return doc;
}

function serializeConfig(doc) {
  return {
    panels: doc.panels || [],
    customTrends: doc.customTrends || [],
    metricLabels: doc.metricLabels || {},
    homePageLayout: doc.homePageLayout || [],
  };
}

exports.getTrendDisplay = async (_req, res) => {
  try {
    const doc = await loadConfig();
    let metrics = [];
    if (mongoose.connection.readyState === 1) {
      metrics = await PlantMetric.find({ enabledGlobally: { $ne: false } })
        .select('metricKey label displayName category unit')
        .sort({ category: 1, label: 1 })
        .lean();
    }

    let cacheKeys = [];
    try {
      const { readPlantTrendsCacheFromDisk } = require('../services/plantReports/plantTrendsCache');
      const cache = readPlantTrendsCacheFromDisk();
      if (cache?.seriesByKey && typeof cache.seriesByKey === 'object') {
        cacheKeys = Object.keys(cache.seriesByKey);
      }
      if (Array.isArray(cache?.metrics)) {
        for (const m of cache.metrics) {
          const k = m?.metricKey || m?.key;
          if (k) cacheKeys.push(String(k));
        }
      }
    } catch {
      /* cache optional */
    }

    let seriesKeys = [];
    try {
      const { readPlantTrendsCacheFromDisk } = require('../services/plantReports/plantTrendsCache');
      const cache = readPlantTrendsCacheFromDisk();
      if (cache?.seriesByKey && typeof cache.seriesByKey === 'object') {
        seriesKeys = Object.entries(cache.seriesByKey)
          .filter(([, rows]) => Array.isArray(rows) && rows.length > 0)
          .map(([key]) => key);
      }
    } catch {
      /* cache optional */
    }

    const metricKeySet = new Set([
      ...metrics.map((m) => m.metricKey),
      ...cacheKeys,
    ]);
    if (seriesKeys.length) {
      for (const key of [...metricKeySet]) {
        if (!seriesKeys.includes(key)) metricKeySet.delete(key);
      }
      for (const key of seriesKeys) metricKeySet.add(key);
    }

    res.json({
      success: true,
      data: {
        ...serializeConfig(doc),
        availableMetrics: [...metricKeySet].sort().map((key) => {
          const row = metrics.find((m) => m.metricKey === key);
          return {
            metricKey: key,
            label: row?.label || key,
            displayName: row?.displayName || '',
            category: row?.category || '',
            unit: row?.unit || '',
          };
        }),
      },
    });
  } catch (err) {
    res.status(500).json({ message: 'Error loading trend display config', error: err.message });
  }
};

exports.patchTrendDisplay = async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ message: 'Database unavailable.' });
    }
    const doc = await loadConfig();
    const before = serializeConfig(doc);
    const {
      panels,
      customTrends,
      metricLabels,
      homePageLayout,
      panel,
      customTrend,
      metricLabel,
    } = req.body || {};

    if (Array.isArray(panels)) doc.panels = panels;
    if (Array.isArray(customTrends)) doc.customTrends = customTrends;
    if (Array.isArray(homePageLayout)) {
      doc.homePageLayout = homePageLayout
        .filter((s) => s?.sectionId)
        .map((s) => ({
          sectionId: String(s.sectionId).trim(),
          visible: s.visible !== false,
          order: Number.isFinite(Number(s.order)) ? Number(s.order) : 0,
          unitOverride: String(s.unitOverride || '').trim(),
        }));
    }

    if (metricLabels && typeof metricLabels === 'object') {
      doc.metricLabels = { ...(doc.metricLabels || {}), ...metricLabels };
    }

    if (panel?.panelId) {
      const idx = (doc.panels || []).findIndex((p) => p.panelId === panel.panelId);
      const entry = {
        panelId: panel.panelId,
        displayName: panel.displayName ?? '',
        metricKeys: Array.isArray(panel.metricKeys) ? panel.metricKeys : [],
      };
      if (idx >= 0) doc.panels[idx] = entry;
      else doc.panels.push(entry);
    }

    if (customTrend?.trendId) {
      const idx = (doc.customTrends || []).findIndex((t) => t.trendId === customTrend.trendId);
      const entry = {
        trendId: customTrend.trendId,
        displayName: customTrend.displayName ?? '',
        metricKeys: Array.isArray(customTrend.metricKeys) ? customTrend.metricKeys : [],
      };
      if (idx >= 0) doc.customTrends[idx] = entry;
      else doc.customTrends.push(entry);
    }

    if (metricLabel?.metricKey) {
      const labels = { ...(doc.metricLabels || {}) };
      if (metricLabel.displayName) labels[metricLabel.metricKey] = metricLabel.displayName;
      else delete labels[metricLabel.metricKey];
      doc.metricLabels = labels;
    }

    await doc.save();

    await logAction({
      actor: req.user,
      action: AUDIT_ACTIONS.TREND_UPDATED,
      targetType: 'trend_display_config',
      targetId: doc._id?.toString(),
      targetName: 'Trend display config',
      before,
      after: serializeConfig(doc),
      req,
    });

    res.json({ success: true, data: serializeConfig(doc) });
  } catch (err) {
    res.status(500).json({ message: 'Error saving trend display config', error: err.message });
  }
};
