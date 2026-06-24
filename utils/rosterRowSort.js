const CREW_SECTION_ORDER = ['General', 'A', 'B', 'C', 'D', 'S'];

function normCrew(crew) {
  const c = String(crew || 'General').trim();
  if (!c) return 'General';
  const u = c.toUpperCase();
  if (u === 'GENERAL' || u === 'G') return 'General';
  if (/^[A-F]$/.test(u)) return u;
  if (/^CREW\s*/i.test(c)) {
    const letter = u.replace(/^CREW\s*/i, '').trim();
    if (/^[A-F]$/.test(letter)) return letter;
    if (letter === 'GENERAL' || letter === 'G') return 'General';
  }
  return c;
}

function roleRank(role) {
  const r = String(role || '').toLowerCase();
  if (r.includes('shift in charge') || /\bsic\b/.test(r)) return 1;
  if (r.includes('supervisor') && !r.includes('shift in charge') && !/\bsic\b/.test(r)) return 2;
  if (r.includes('ccr') && !r.includes('local')) return 3;
  if (r.includes('local operator') || (r.includes('local') && r.includes('operator'))) return 4;
  if (r.includes('chemist') || r.includes('chemistry')) return 5;
  return 50;
}

function groupSortKey(emp) {
  const label = `${emp.opsGroupLabel || ''} ${emp.role || ''}`.trim();
  const m = label.match(/group\s*([\d]+)\s*[-–]\s*([\d]+)/i)
    || label.match(/([\d]+)\s*[-–]\s*([\d]+)/);
  if (m) return parseInt(m[1], 10);
  const single = label.match(/group\s*([\d]+)/i);
  if (single) return parseInt(single[1], 10);
  return 99;
}

function isGeneralCrew(crew) {
  return normCrew(crew) === 'General';
}

function crewSectionIndex(crew) {
  const n = normCrew(crew);
  const idx = CREW_SECTION_ORDER.indexOf(n);
  return idx >= 0 ? idx : CREW_SECTION_ORDER.length;
}

function sortRosterEmployees(employees) {
  return [...employees].sort((a, b) => {
    const ca = crewSectionIndex(a.crew);
    const cb = crewSectionIndex(b.crew);
    if (ca !== cb) return ca - cb;
    const ra = roleRank(a.role);
    const rb = roleRank(b.role);
    if (ra !== rb) return ra - rb;
    const ga = groupSortKey(a);
    const gb = groupSortKey(b);
    if (ga !== gb) return ga - gb;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
}

module.exports = {
  normCrew,
  isGeneralCrew,
  roleRank,
  groupSortKey,
  crewSectionIndex,
  sortRosterEmployees,
  CREW_SECTION_ORDER,
};
