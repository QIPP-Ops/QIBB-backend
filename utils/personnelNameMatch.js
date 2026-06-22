function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameTokens(value) {
  return normalizeName(value).split(' ').filter(Boolean);
}

function namesMatch(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;

  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (!ta.length || !tb.length) return false;

  const shared = ta.filter((t) => tb.includes(t));
  const minLen = Math.min(ta.length, tb.length);
  return shared.length >= Math.max(2, minLen - 1);
}

function titleCaseName(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (s !== s.toUpperCase()) return s;
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

module.exports = {
  normalizeName,
  nameTokens,
  namesMatch,
  titleCaseName,
};
