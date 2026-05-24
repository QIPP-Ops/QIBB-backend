/** Canonical metric keys — merge day-column suffixes into one series per parameter. */
const DAY_KEY_RE = /_day(\d+)$/i;
const DAY_LABEL_RE = /\s*\(day\s*\d+\)\s*$/i;

function canonicalMetricKey(metricKey) {
  if (!metricKey) return '';
  return String(metricKey).replace(DAY_KEY_RE, '');
}

function canonicalLabel(label, metricKey) {
  const base = String(label || metricKey || '').replace(DAY_LABEL_RE, '').trim();
  return base || canonicalMetricKey(metricKey);
}

function isDaySplitMetricKey(metricKey) {
  return DAY_KEY_RE.test(String(metricKey || ''));
}

/** Expand canonical keys to include legacy _dayN variants in Mongo queries. */
function expandMetricKeysForQuery(keys) {
  const out = new Set();
  for (const k of keys) {
    if (!k) continue;
    out.add(k);
    const base = canonicalMetricKey(k);
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
    const ck = canonicalMetricKey(m.metricKey);
    const label = canonicalLabel(m.label, m.metricKey);
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
  canonicalMetricKey,
  canonicalLabel,
  isDaySplitMetricKey,
  expandMetricKeysForQuery,
  metricKeyMatchesCanonical,
  dedupeMetricsForListing,
};
