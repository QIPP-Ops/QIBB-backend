/** Minimum trimmed length for a remark to be stored as a shift highlight. */
const MIN_HIGHLIGHT_LENGTH = 15;

/** Reject remarks shorter than this even if they pass other checks. */
const MIN_TRIM_LENGTH = 8;

/**
 * Generic non-informative phrases (lowercase). Extend via env OPS_HIGHLIGHT_BLOCKLIST
 * as comma-separated values.
 */
const DEFAULT_BLOCKLIST = [
  'all are in service',
  'all in service',
  'all units in service',
  'normal operation',
  'no remarks',
  'n/a',
  'na',
  'nil',
  'none',
  'ok',
  'okay',
];

const DATE_ONLY_PATTERNS = [
  /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/,
  /^\d{4}[./-]\d{1,2}[./-]\d{1,2}$/,
  /^\d{8}$/,
  /^\d{1,2}\s+[a-z]{3,9}\s+\d{4}$/i,
];

/** Verb / action tokens suggesting substantive operational content. */
const ACTION_WORD_RE =
  /\b(reported|completed|issued|replaced|started|stopped|shutdown|trip|alarm|leak|repair|maintenance|inspection|isolated|restored|commissioned|decommissioned|adjusted|calibrated|cleaned|replaced|failed|tripped|bypassed|opened|closed|increased|decreased|reduced|elevated|detected|observed|noted|requested|approved|rejected|scheduled|postponed|cancelled|canceled|ongoing|pending|resolved|investigating|monitoring|testing|loading|unloading|transfer|switchover|outage|startup|runback|derate|limit|exceeded|breach|violation|emergency|incident|near miss|work order|permit|ptw|isolation|lockout|tagout)\b/i;

function loadBlocklist() {
  const extra = String(process.env.OPS_HIGHLIGHT_BLOCKLIST || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return [...DEFAULT_BLOCKLIST, ...extra];
}

function normalizeText(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isDateOnly(text) {
  const t = normalizeText(text);
  return DATE_ONLY_PATTERNS.some((re) => re.test(t));
}

function endsWithLabelOnly(text) {
  const t = normalizeText(text);
  if (!t.endsWith(':')) return false;
  const before = t.slice(0, -1).trim();
  return before.length > 0 && before.length < 80 && !/\.\s*$/.test(before);
}

function isBlocklisted(text) {
  const lower = normalizeText(text).toLowerCase().replace(/[.!]+$/, '');
  const blocklist = loadBlocklist();
  return blocklist.some((phrase) => lower === phrase || lower.startsWith(`${phrase}.`));
}

function hasSubstantiveContent(text) {
  const t = normalizeText(text);
  if (t.length >= MIN_HIGHLIGHT_LENGTH) return true;
  if (ACTION_WORD_RE.test(t)) return true;
  return false;
}

/**
 * Returns true when remark text is worth persisting as an ops shift highlight.
 * Filters: date-only, too short, label-without-value, generic phrases, low substance.
 */
function isValidOpsHighlight(text) {
  const t = normalizeText(text);
  if (!t || t.length < MIN_TRIM_LENGTH) return false;
  if (isDateOnly(t)) return false;
  if (endsWithLabelOnly(t)) return false;
  if (isBlocklisted(t)) return false;
  if (/^#|^n\/a|^no sample/i.test(t)) return false;
  if (!hasSubstantiveContent(t)) return false;
  return true;
}

function filterOpsHighlights(highlights) {
  if (!Array.isArray(highlights)) return [];
  return highlights.filter((h) => isValidOpsHighlight(h?.text));
}

module.exports = {
  MIN_HIGHLIGHT_LENGTH,
  MIN_TRIM_LENGTH,
  DEFAULT_BLOCKLIST,
  isValidOpsHighlight,
  filterOpsHighlights,
  normalizeHighlightText: normalizeText,
};
