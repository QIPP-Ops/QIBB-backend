/** Canonical metric keys — merge day/column suffixes into one series per parameter. */
const DAY_KEY_RE = /_day_?(\d+)$/i;
const COL_KEY_RE = /_col_?(\d+)$/i;
const DAY_LABEL_RE = /\s*\(day\s*\d+\)\s*$/i;
/** Legacy ingest keys that should not appear in listings or panels */
const BAD_METRIC_KEY_RE = /_(?:day|col)_\d+/i;

function canonicalMetricKey(metricKey) {
  if (!metricKey) return '';
  return String(metricKey)
    .replace(DAY_KEY_RE, '')
    .replace(COL_KEY_RE, '');
}

function canonicalLabel(label, metricKey) {
  const base = String(label || metricKey || '')
    .replace(DAY_LABEL_RE, '')
    .replace(/\s*\(col\s*\d+\)\s*$/i, '')
    .trim();
  return base || canonicalMetricKey(metricKey);
}

function isDaySplitMetricKey(metricKey) {
  return DAY_KEY_RE.test(String(metricKey || ''));
}

function isBadMetricKey(metricKey) {
  return BAD_METRIC_KEY_RE.test(String(metricKey || ''));
}

/** Humanize metricKey when displayName is missing */
function deriveDisplayNameFromKey(metricKey) {
  const ck = canonicalMetricKey(metricKey);
  if (!ck) return '';
  return ck
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Expand canonical keys to include legacy _dayN / _day_N variants in Mongo queries. */
function expandMetricKeysForQuery(keys) {
  const out = new Set();
  for (const k of keys) {
    if (!k) continue;
    const base = canonicalMetricKey(k);
    out.add(k);
    out.add(base);
    if (base !== k) out.add(k);
  }
  return [...out];
}

function metricKeyMatchesCanonical(storedKey, requestedKey) {
  return canonicalMetricKey(storedKey) === canonicalMetricKey(requestedKey);
}

function dedupeMetricsForListing(metrics) {
  const byCanonical = new Map();
  for (const m of metrics) {
    if (isBadMetricKey(m.metricKey)) continue;
    const ck = canonicalMetricKey(m.metricKey);
    const label = canonicalLabel(m.displayName || m.label, m.metricKey);
    const prev = byCanonical.get(ck);
    if (!prev) {
      byCanonical.set(ck, { ...m, metricKey: ck, label });
      continue;
    }
    const preferNew =
      isDaySplitMetricKey(prev.metricKey) && !isDaySplitMetricKey(m.metricKey);
    if (preferNew) {
      byCanonical.set(ck, { ...m, metricKey: ck, label });
    }
  }
  return [...byCanonical.values()].sort(
    (a, b) =>
      String(a.category).localeCompare(String(b.category)) ||
      String(a.label).localeCompare(String(b.label))
  );
}

module.exports = {
  DAY_KEY_RE,
  COL_KEY_RE,
  BAD_METRIC_KEY_RE,
  canonicalMetricKey,
  canonicalLabel,
  isDaySplitMetricKey,
  isBadMetricKey,
  deriveDisplayNameFromKey,
  expandMetricKeysForQuery,
  metricKeyMatchesCanonical,
  dedupeMetricsForListing,
};
