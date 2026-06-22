const fs = require('fs');
const path = require('path');
const { parseDepartmentFromDesignation } = require('./maintenanceDepartment');
const { namesMatch, titleCaseName } = require('./personnelNameMatch');

const DEFAULT_HTML = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  'Downloads',
  'whole ops org chart.html'
);

function decodeJsonString(raw) {
  if (!raw) return '';
  return String(raw)
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#x200E;/g, '');
}

function extractViewer(html) {
  const viewer = {
    name: '',
    email: '',
    title: '',
    userId: '',
    personId: null,
    timeZone: '',
  };

  const fullName = html.match(/"fullName"\s*:\s*"([^"]+)"/);
  if (fullName) viewer.name = fullName[1];

  const userName = html.match(/"userName"\s*:\s*"([^"]+)"/);
  if (userName) viewer.email = userName[1].toLowerCase();

  const displayTitle = html.match(/"displayTitle"\s*:\s*"([^"]+)"/);
  if (displayTitle) viewer.title = displayTitle[1];

  const userId = html.match(/"userId"\s*:\s*"?(\d+)"?/);
  if (userId) viewer.userId = userId[1];
  if (!viewer.userId) {
    const idNearProfile = html.match(/"fullName"[\s\S]{0,400}?"id"\s*:\s*"?(\d+)"?/);
    if (idNearProfile) viewer.userId = idNearProfile[1];
  }

  const personId = html.match(/"personId"\s*:\s*(\d+)/);
  if (personId) viewer.personId = Number(personId[1]);

  const timeZone = html.match(/"timeZone"\s*:\s*"([^"]+)"/);
  if (timeZone) viewer.timeZone = timeZone[1];

  return viewer;
}

function extractTreeMembers(html) {
  const calStart = html.indexOf('idTAC---main--idTree');
  const section = calStart >= 0 ? html.slice(calStart) : html;

  const nodeRe =
    /idTAC---main--idListItem-idTAC---main--idTree-(\d+)[\s\S]*?aria-level="(\d+)"[\s\S]*?>([A-Za-z][^<]{3,80})</g;

  const byIdx = new Map();
  let m;
  while ((m = nodeRe.exec(section)) !== null) {
    const name = m[3].trim();
    if (/^(Expand|Collapse|Counter|Avatar|Image|No Data)/i.test(name)) continue;
    const idx = Number(m[1]);
    if (!byIdx.has(idx)) {
      byIdx.set(idx, {
        treeOrder: idx,
        level: Number(m[2]),
        name: titleCaseName(name),
      });
    }
  }

  const nodes = [...byIdx.values()].sort((a, b) => a.treeOrder - b.treeOrder);
  const stack = [];
  return nodes.map((node) => {
    while (stack.length && stack[stack.length - 1].level >= node.level) stack.pop();
    const parent = stack.length ? stack[stack.length - 1].name : null;
    stack.push(node);
    return { ...node, reportsTo: parent };
  });
}

function loadOptionalJson(relativePath) {
  const full = path.join(__dirname, '..', relativePath);
  if (!fs.existsSync(full)) return [];
  return JSON.parse(fs.readFileSync(full, 'utf8'));
}

function findByName(name, rows, keys = ['name', 'fullName']) {
  if (!name || !rows?.length) return null;
  const exact = rows.find((row) =>
    keys.some((k) => namesMatch(row[k], name))
  );
  if (exact) return exact;

  const fuzzy = rows.filter((row) => keys.some((k) => namesMatch(name, row[k])));
  return fuzzy.length === 1 ? fuzzy[0] : null;
}

function inferDepartment(role, designation) {
  const r = String(role || '').toLowerCase();
  const d = String(designation || '').toUpperCase();
  if (d.startsWith('MMD') || r.includes('mechanical')) return 'MMD';
  if (d.startsWith('EMD') || r.includes('electrical')) return 'EMD';
  if (d.startsWith('IMD') || r.includes('instrument')) return 'IMD';
  if (/chemist|chemistry|lab/.test(r)) return 'Operations';
  if (/operator|supervisor|shift|ccr|gdp|bop|manager|engineer/.test(r)) return 'Operations';
  return '';
}

/**
 * Parse SAP SuccessFactors Team Absence Calendar HTML export into QIPP org structure.
 * @param {string} html
 * @param {{ roster?: object[], personnelEmails?: object[], ptwPersonnel?: object[] }} enrich
 */
function parseOpsOrgChartHtml(html, enrich = {}) {
  const viewer = extractViewer(html);
  const treeMembers = extractTreeMembers(html);

  const roster = enrich.roster || loadOptionalJson('data/roster.json');
  const personnelEmails = enrich.personnelEmails || loadOptionalJson('data/personnel-emails.json');
  const ptwPersonnel = enrich.ptwPersonnel || loadOptionalJson('data/ptw-authorization-2026.json');

  const managerName = viewer.name || 'Operations Manager';
  const members = treeMembers.map((node) => {
    const rosterRow = findByName(node.name, roster, ['name', 'fullName']);
    const emailRow = findByName(node.name, personnelEmails);
    const ptwRow = findByName(node.name, ptwPersonnel);

    const role = rosterRow?.role || '';
    const designation = ptwRow?.designation || '';
    const maintenanceDepartment =
      parseDepartmentFromDesignation(designation) ||
      parseDepartmentFromDesignation(role) ||
      '';

    return {
      name: emailRow?.name || rosterRow?.fullName || rosterRow?.name || node.name,
      displayName: node.name,
      email: String(emailRow?.email || '').trim().toLowerCase(),
      empId: String(emailRow?.empId || rosterRow?.empId || ptwRow?.empId || ptwRow?.empNo || '').trim(),
      employeeExternalId: String(viewer.userId && node.reportsTo === null ? '' : '').trim(),
      title: role,
      role,
      crew: rosterRow?.crew || '',
      department: inferDepartment(role, designation) || 'Operations',
      maintenanceDepartment,
      location: viewer.timeZone ? 'Rabigh' : '',
      reportsTo: node.reportsTo || managerName,
      treeOrder: node.treeOrder,
      treeLevel: node.level,
      ptwDesignation: designation,
      ptwMatched: Boolean(ptwRow),
      rosterMatched: Boolean(rosterRow),
      emailMatched: Boolean(emailRow),
    };
  });

  const summary = {
    totalMembers: members.length,
    rosterMatched: members.filter((m) => m.rosterMatched).length,
    emailMatched: members.filter((m) => m.emailMatched).length,
    ptwMatched: members.filter((m) => m.ptwMatched).length,
    withMaintenanceDepartment: members.filter((m) => m.maintenanceDepartment).length,
    flatHierarchy: members.every((m) => m.treeLevel === 1),
  };

  return {
    source: {
      page: 'TEAM_ABSENCE_CALENDAR',
      module: 'EMPLOYEE_FILE',
      note: 'SAP SuccessFactors team absence export; tree is flat direct reports under viewer.',
      viewer,
    },
    manager: {
      name: managerName,
      email: viewer.email,
      title: viewer.title || 'Operation Manager',
      userId: viewer.userId,
      personId: viewer.personId,
      location: viewer.timeZone,
      department: 'Operations',
    },
    summary,
    members,
  };
}

function parseOpsOrgChartFile(filePath = DEFAULT_HTML) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Org chart HTML not found: ${filePath}`);
  }
  const html = fs.readFileSync(filePath, 'utf8');
  return parseOpsOrgChartHtml(html);
}

module.exports = {
  DEFAULT_HTML,
  parseOpsOrgChartHtml,
  parseOpsOrgChartFile,
  extractViewer,
  extractTreeMembers,
};
