const fs = require('fs');
const path = require('path');
const { htmlUnescape } = require('./htmlUnescape');
const {
  mapWoStatus,
  mapJhaStatus,
  mapPermitStatus,
  mapPriority,
  permitTypeCode,
} = require('../constants/qippLifecycle');
const { inferDepartment } = require('./qippDepartment');
const { buildWorkPacks, buildPermitPackages, linkJhasToWorkOrders } = require('./qippWorkPack');

function readExportFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function cleanCell(text) {
  return htmlUnescape(String(text || '').replace(/\s+/g, ' ').trim());
}

function deptFor(workDescription, equipmentCode, fallback = '') {
  return inferDepartment(workDescription, equipmentCode, fallback);
}

const WO_TASK_PLANNER_STATUSES = [
  'JHAAssigned', 'RLQ4', 'APQ4', 'CLQ4', 'Raised', 'RLQ', 'APQ', 'CLQ',
];

const WO_TASK_PLANNER_DATE_TAIL = new RegExp(
  '((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) \\d{2} \\w{3} \\d{4} \\d{2}:\\d{2})'
    + '((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) \\d{2} \\w{3} \\d{4} \\d{2}:\\d{2})'
    + '(?:(Low|Medium|High|Emergency|Shutdown))?(.+)$'
);

const WO_TASK_PLANNER_EQUIPMENT = /^(\d{2}[A-Z0-9-]{3,20}|QIPP-[A-Z0-9-]+)/;

function refineTaskPlannerEquipment(equipmentCode, description) {
  let code = equipmentCode;
  let desc = description;
  for (const prefix of ['RM', 'PM']) {
    if (!code.endsWith(prefix)) continue;
    code = code.slice(0, -prefix.length);
    const trimmed = desc.trimStart();
    desc = trimmed.startsWith(prefix) ? trimmed : `${prefix} ${trimmed}`;
    break;
  }
  return { equipmentCode: code, description: cleanCell(desc) };
}

function parseTaskPlannerWorkOrderChunk(chunk) {
  const row = cleanCell(chunk);
  if (!/^\d{12}/.test(row)) return null;

  const dateMatch = row.match(WO_TASK_PLANNER_DATE_TAIL);
  if (!dateMatch) return null;

  const head = row.slice(0, row.length - dateMatch[0].length);
  const woMatch = head.match(/^(\d{12})(.*)$/);
  if (!woMatch) return null;

  let prometheusStatusCode = '';
  let equipmentCode = '';
  let description = '';
  const rest = woMatch[2];

  for (const status of WO_TASK_PLANNER_STATUSES) {
    if (!rest.startsWith(status)) continue;
    const afterStatus = rest.slice(status.length);
    const equipMatch = afterStatus.match(WO_TASK_PLANNER_EQUIPMENT);
    if (!equipMatch) continue;
    prometheusStatusCode = status;
    equipmentCode = cleanCell(equipMatch[1]);
    description = cleanCell(afterStatus.slice(equipMatch[0].length));
    ({ equipmentCode, description } = refineTaskPlannerEquipment(equipmentCode, description));
    break;
  }

  if (!prometheusStatusCode || !equipmentCode) return null;

  const plannedStart = cleanCell(dateMatch[1]);
  const plannedFinish = cleanCell(dateMatch[2]);
  const prometheusPriorityCode = cleanCell(dateMatch[3] || '');
  const reportedBy = cleanCell(dateMatch[4] || '');

  return {
    code: woMatch[1],
    status: mapWoStatus(prometheusStatusCode),
    prometheusStatusCode,
    equipmentCode,
    description,
    equipmentDescription: '',
    plannedStart,
    plannedFinish,
    priority: mapPriority(prometheusPriorityCode || 'Low'),
    prometheusPriorityCode: prometheusPriorityCode || '',
    reportedBy,
    department: deptFor(description, equipmentCode, woMatch[1]),
  };
}

/** Parse concatenated Task Planner "List All Work" paste rows. */
function parseTaskPlannerWorkOrders(content) {
  const seen = new Set();
  const rows = [];
  const text = String(content || '');
  const startIdx = text.indexOf('Reported By ID');
  const body = startIdx >= 0 ? text.slice(startIdx) : text;
  const chunks = body.split(/\[ \] /);

  chunks.forEach((chunk) => {
    const parsed = parseTaskPlannerWorkOrderChunk(chunk);
    if (!parsed || seen.has(parsed.code)) return;
    seen.add(parsed.code);
    rows.push(parsed);
  });

  return rows;
}

function mergeWorkOrders(existing, incoming) {
  const byCode = new Map();
  existing.forEach((row) => byCode.set(row.code, row));
  incoming.forEach((row) => {
    const prev = byCode.get(row.code);
    byCode.set(row.code, prev ? { ...prev, ...row } : row);
  });
  return [...byCode.values()];
}

function parseWorkOrders(content) {
  const pat = new RegExp(
    'Entity/WorkOrder\\?code=(\\d+)[^>]*>\\d+</a></td><td[^>]*>([^<]*)</td>'
      + '<td[^>]*><a[^>]*Entity/Equipment\\?code=([^&"]+)[^>]*>([^<]*)</a></td>'
      + '<td[^>]*>([^<]*)</td><td[^>]*>([^<]*)</td><td[^>]*>([^<]*)</td>'
      + '<td[^>]*>([^<]*)</td><td[^>]*>([^<]*)</td>'
      + '<td[^>]*><a[^>]*Entity/Person\\?code=([^&"]+)',
    'g'
  );
  const seen = new Set();
  const rows = [];
  let m;
  while ((m = pat.exec(content)) !== null) {
    const code = m[1];
    if (seen.has(code)) continue;
    seen.add(code);
    const prometheusStatusCode = cleanCell(m[2]);
    const equipmentCode = cleanCell(m[3]);
    const description = cleanCell(m[5]);
    rows.push({
      code,
      status: mapWoStatus(prometheusStatusCode),
      prometheusStatusCode,
      equipmentCode,
      description,
      equipmentDescription: cleanCell(m[6]),
      plannedStart: cleanCell(m[7]),
      plannedFinish: cleanCell(m[8]),
      priority: mapPriority(cleanCell(m[9])),
      prometheusPriorityCode: cleanCell(m[9]),
      reportedBy: cleanCell(m[10]),
      department: deptFor(description, equipmentCode, code),
    });
  }
  return rows;
}

function parseSafetyPermits(content) {
  const pat = new RegExp(
    'Entity/SafetyPermitLive\\?code=(PE\\d+)[^>]*>PE\\d+</a></td><td[^>]*>([^<]*)</td>'
      + '<td[^>]*>([^<]*)</td>'
      + '<td[^>]*><a[^>]*Entity/Equipment\\?code=([^&"]+)[^>]*>([^<]*)</a></td>'
      + '<td[^>]*>([^<]*)</td><td[^>]*>([^<]*)</td>'
      + '<td[^>]*>([^<]*)</td><td[^>]*>([^<]*)</td>'
      + '<td[^>]*right-aligned[^>]*>(\\d+)',
    'g'
  );
  const seen = new Set();
  const rows = [];
  let m;
  while ((m = pat.exec(content)) !== null) {
    const code = m[1];
    if (seen.has(code)) continue;
    seen.add(code);
    const prometheusStatusCode = cleanCell(m[2]);
    const typeLabel = cleanCell(m[3]);
    const equipmentCode = cleanCell(m[4]);
    const workDescription = cleanCell(m[7]);
    rows.push({
      code,
      status: mapPermitStatus(prometheusStatusCode),
      prometheusStatusCode,
      typeCode: permitTypeCode(typeLabel),
      typeLabel,
      equipmentCode,
      equipmentDescription: cleanCell(m[6]),
      workDescription,
      locationName: cleanCell(m[8]),
      validFrom: cleanCell(m[9]),
      numberOfWorkers: parseInt(m[10], 10) || 0,
      workOrderCode: '',
      jhaCode: '',
      department: deptFor(workDescription, equipmentCode, code),
    });
  }
  return rows;
}

function parseIsolationPoints(content) {
  const pat = new RegExp(
    'Entity/IsolationPoint\\?code=([^&"]+)[^>]*>[^<]*</a></td>'
      + '<td[^>]*><a[^>]*Entity/Equipment\\?code=([^&"]+)[^>]*>[^<]*</a></td>'
      + '<td[^>]*>([^<]*)</td><td[^>]*>([^<]*)',
    'g'
  );
  const seen = new Set();
  const rows = [];
  let m;
  while ((m = pat.exec(content)) !== null) {
    const code = cleanCell(m[1]);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    const equipmentCode = cleanCell(m[2]);
    const description = cleanCell(m[4]);
    rows.push({
      code,
      equipmentCode,
      isolationMethodCode: cleanCell(m[3]),
      description,
      department: deptFor(description, equipmentCode, code),
    });
  }
  return rows;
}

function parsePlantEquipment(content) {
  const pat = new RegExp(
    'Entity/Plant\\?code=([^&"]+)[^>]*>([^<]*)</a></td><td[^>]*>([^<]*)</td>'
      + '<td[^>]*>([^<]*)</td><td[^>]*>([^<]*)</td>'
      + '<td[^>]*><a[^>]*Entity/Equipment\\?code=([^&"]+)[^>]*>([^<]*)</a>',
    'g'
  );
  const seen = new Set();
  const rows = [];
  let m;
  while ((m = pat.exec(content)) !== null) {
    const code = cleanCell(m[1]);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    const description = cleanCell(m[3]);
    const locationName = cleanCell(m[4]);
    rows.push({
      code,
      description,
      locationName,
      team: cleanCell(m[5]),
      parentEquipmentCode: cleanCell(m[6]),
      department: deptFor(description, code, code),
    });
  }
  return rows;
}

function parseLocations(content) {
  const pat = new RegExp(
    'Entity/Location\\?code=([^&"]+)[^>]*>([^<]*)</a></td><td[^>]*>([^<]*)</td><td[^>]*>([^<]*)</td>',
    'g'
  );
  const seen = new Set();
  const rows = [];
  let m;
  while ((m = pat.exec(content)) !== null) {
    const code = cleanCell(m[1]);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    const name = cleanCell(m[3]);
    const summary = cleanCell(m[4]);
    rows.push({
      code,
      name,
      summary,
      department: deptFor(summary, code, code),
    });
  }
  return rows;
}

function parseKeySafes(content) {
  const pat = new RegExp(
    'Entity/KeySafe\\?code=([^&"]+)[^>]*>([^<]*)</a></td><td[^>]*>([^<]*)</td><td[^>]*>([^<]*)</td>'
      + '(?:<td[^>]*>(\\d+)</td>)?',
    'g'
  );
  const seen = new Set();
  const rows = [];
  let m;
  while ((m = pat.exec(content)) !== null) {
    const rawCode = cleanCell(m[1]);
    const code = decodeURIComponent(rawCode);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    const displayName = cleanCell(m[2]);
    const status = cleanCell(m[3]);
    const description = cleanCell(m[4]);
    rows.push({
      code,
      displayName,
      status,
      description,
      keyCount: parseInt(m[5], 10) || 0,
      department: deptFor(description, code, code),
    });
  }
  return rows;
}

function stripJhaTaskPlannerFooter(content) {
  return String(content || '')
    .replace(/\n?•[\s\S]*$/m, '')
    .replace(/Pageof[\s\S]*$/m, '')
    .replace(/<\/user_query>[\s\S]*$/m, '')
    .trim();
}

const JHA_TASK_PLANNER_LOCATIONS = [
  /^NOMAC QIPP Plant/,
  /^BALANCE OF PLANT BUILDING/,
  /^COMMON ELECTRICAL AREA/,
  /^FIRE FIGTING AREA/,
  /^CHILLER AREA/,
  /^CHLORINATION AREA/,
  /^FUEL GAS AREA/,
  /^FUEL OIL AREA/,
  /^PLANT HVAC AREA/,
  /^REVERSE OSMOSIS AREA/,
  /^INSTRUMENTS AIR AREA/,
  /^DM PLANT AREA/,
  /^SEAWATER AREA/,
  /^WASTE WATER AREA/,
  /^SERVICE WATER AREA/,
  /^POTABLE WATER AREA/,
  /^STEAM TURBINE \d+ AREA/,
  /^GAS TURBINE \d+ AREA/,
  /^HRSG \d+ AREA/,
  /^HVAC_SYS/,
  /^WASTEWATER/,
  /^DM_PLANT/,
  /^STGBOP\d+/,
  /^HRSG\d{2}/,
  /^SAB2/,
  /^UQK/,
  /^UGM/,
  /^MISC/,
  /^ADMIN/,
  /^BOP/,
  /^GT\d{2}/,
  /^ST\d{2}/,
];

function matchJhaTaskPlannerEquipment(rest) {
  const qippDash = rest.match(/^QIPP-\d{2}[A-Z]-[A-Z]{2,4}/);
  if (qippDash) return qippDash[0];

  const qippDashLong = rest.match(/^QIPP-[\dA-Z]+-[A-Z]{2,4}/);
  if (qippDashLong) return qippDashLong[0];

  const qippPlant = rest.match(/^QIPP\d{2}(?=Plant)/);
  if (qippPlant) return qippPlant[0];

  const qippLong = rest.match(/^QIPP\d{2}[A-Z0-9]+/);
  if (qippLong) {
    const raw = qippLong[0];
    for (let len = Math.min(raw.length, 22); len >= 10; len -= 1) {
      const candidate = raw.slice(0, len);
      const tail = rest.slice(len);
      if (!tail) return candidate;
      if (/[A-Z]{2,}-/.test(tail)) return candidate;
      if (/[a-z]/.test(tail[0])) return candidate;
      if (/^(RM |OT_ACTIVITY_|WATER |PUMP|BOX )/.test(tail)) return candidate;
    }
    return raw.slice(0, 18);
  }

  const digitTag = rest.match(/^\d{2}[A-Z0-9]+/);
  if (!digitTag) return '';
  const raw = digitTag[0];
  for (let len = Math.min(raw.length, 18); len >= 8; len -= 1) {
    const tail = rest.slice(len);
    if (!tail) return raw.slice(0, len);
    if (/[A-Z]{2,}-/.test(tail)) return raw.slice(0, len);
    if (/[a-z]/.test(tail[0])) return raw.slice(0, len);
    if (tail[0] === ' ' || tail[0] === '"') return raw.slice(0, len);
  }
  return raw.slice(0, 14);
}

function splitJhaEquipAndWork(tail) {
  const markers = ['OT_ACTIVITY_', 'RM ', 'CBM:', 'OVERHAULING,', '1M RM', 'PM OF', 'MB '];
  let splitAt = -1;
  markers.forEach((marker) => {
    const idx = tail.indexOf(marker);
    if (idx > 0 && (splitAt < 0 || idx < splitAt)) splitAt = idx;
  });
  if (splitAt > 0) {
    return {
      equipmentDescription: cleanCell(tail.slice(0, splitAt)),
      workDescription: cleanCell(tail.slice(splitAt)),
    };
  }
  const lower = tail.search(/[a-z]/);
  if (lower > 8) {
    return {
      equipmentDescription: cleanCell(tail.slice(0, lower)),
      workDescription: cleanCell(tail.slice(lower)),
    };
  }
  return { equipmentDescription: cleanCell(tail), workDescription: '' };
}

function parseJhaTaskPlannerRow(row) {
  let rest = String(row || '').trim();
  let code = '';
  let status = '';

  if (rest.startsWith('Not Required')) {
    status = 'Not Required';
    rest = rest.slice('Not Required'.length);
  } else {
    const withRa = rest.match(/^RA(\d{6})(Closed|Raised|Approved|Submitted|Not Required)/);
    if (!withRa) return null;
    code = `RA${withRa[1]}`;
    status = withRa[2];
    rest = rest.slice(withRa[0].length);
  }

  if (!rest.startsWith('Job Hazard Analysis')) return null;
  rest = rest.slice('Job Hazard Analysis'.length);

  let locationName = '';
  JHA_TASK_PLANNER_LOCATIONS.some((pat) => {
    const m = rest.match(pat);
    if (!m) return false;
    locationName = m[0];
    rest = rest.slice(locationName.length);
    return true;
  });
  if (!locationName) return null;

  const equipmentCode = matchJhaTaskPlannerEquipment(rest);
  if (!equipmentCode) return null;
  rest = rest.slice(equipmentCode.length);

  const { equipmentDescription, workDescription } = splitJhaEquipAndWork(rest);
  if (!code) code = `NR-${equipmentCode}`;

  const prometheusStatusCode = status;
  return {
    code,
    status: mapJhaStatus(prometheusStatusCode),
    prometheusStatusCode,
    jhaType: 'Job Hazard Analysis',
    locationName,
    workOrderCode: '',
    equipmentCode,
    equipmentDescription,
    workDescription,
    department: deptFor(workDescription, equipmentCode, code),
  };
}

/** Parse JHA Summary grid rows from Task Planner paste (concatenated columns). */
function parseJhasFromTaskPlanner(content) {
  const body = stripJhaTaskPlannerFooter(content);
  const rows = body.split(/\[ \]/).map((s) => s.trim()).filter((s) => /^(?:RA\d{6}|Not Required)/.test(s));
  const seen = new Set();
  const parsed = [];
  rows.forEach((row) => {
    const item = parseJhaTaskPlannerRow(row);
    if (!item || seen.has(item.code)) return;
    seen.add(item.code);
    parsed.push(item);
  });
  return parsed;
}

/** Parse JHA rows from list HTML when present. */
function parseJhasFromHtml(content) {
  const pat = new RegExp(
    'Entity/RiskAssessmentLive\\?code=([^&"]+)[^>]*>([^<]*)</a></td><td[^>]*>([^<]*)</td>'
      + '(?:<td[^>]*>(?:<a[^>]*Entity/WorkOrder\\?code=(\\d+)[^>]*>[^<]*</a>|([^<]*))</td>)?'
      + '<td[^>]*>(?:<a[^>]*Entity/Equipment\\?code=([^&"]+)[^>]*>[^<]*</a>|([^<]*))</td>'
      + '<td[^>]*>([^<]*)</td>',
    'g'
  );
  const seen = new Set();
  const rows = [];
  let m;
  while ((m = pat.exec(content)) !== null) {
    const code = cleanCell(m[1]);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    const prometheusStatusCode = cleanCell(m[3]);
    const workOrderCode = cleanCell(m[4] || m[5]);
    const equipmentCode = cleanCell(m[6] || m[7]);
    const workDescription = cleanCell(m[8]);
    rows.push({
      code,
      status: mapJhaStatus(prometheusStatusCode),
      prometheusStatusCode,
      workOrderCode,
      equipmentCode,
      workDescription,
      equipmentDescription: '',
      department: deptFor(workDescription, equipmentCode, code),
    });
  }
  return rows;
}

/** Extract JHA / WO references embedded in engica.pageData JSON blobs. */
function parseJhaReferencesFromPageData(contents) {
  const refs = [];
  const blob = Array.isArray(contents) ? contents.join('\n') : String(contents || '');
  const jhaPat = /RiskAssessmentLive\?code=([^&"\\]+)/g;
  const woPat = /WorkOrder\?code=(\d{6,})/g;
  let m;
  while ((m = jhaPat.exec(blob)) !== null) {
    refs.push({ type: 'jha', code: cleanCell(decodeURIComponent(m[1])) });
  }
  while ((m = woPat.exec(blob)) !== null) {
    refs.push({ type: 'wo', code: m[1] });
  }
  return refs;
}

function parsePinboardCounts(content) {
  const groups = [];
  const pat = /<span class="group-key">([^<]+)<\/span><span class="group-count">(\d+)<\/span>/g;
  let m;
  while ((m = pat.exec(content)) !== null) {
    groups.push({ key: cleanCell(m[1]), count: parseInt(m[2], 10) || 0 });
  }
  return groups;
}

function parsePinboardSections(content) {
  const sections = {};
  if (content.includes('RiskAssessmentLive') || content.includes('JHA Status')) {
    const jhaBlock = content.match(/JHA Status Table[\s\S]*?q4-data-area[^>]*>([\s\S]*?)<\/div>/i);
    if (jhaBlock) sections.jha = parsePinboardCounts(jhaBlock[1]);
  }
  const peBlock = content.match(/Permit Status Table[\s\S]*?q4-data-area[^>]*>([\s\S]*?)<\/div>/i);
  if (peBlock) sections.permits = parsePinboardCounts(peBlock[1]);
  const woBlock = content.match(/Work Order by Status[\s\S]*?q4-data-area[^>]*>([\s\S]*?)<\/div>/i);
  if (woBlock) sections.workOrders = parsePinboardCounts(woBlock[1]);
  return sections;
}

function synthesizeJhasFromWorkOrders(workOrders) {
  const jhaWos = workOrders.filter((wo) =>
    ['jha_assigned', 'jha_approved', 'released', 'raised'].includes(wo.status)
  );
  return jhaWos.map((wo) => {
    let status = 'submitted';
    if (wo.status === 'raised') status = 'raised';
    if (wo.status === 'jha_assigned') status = 'raised';
    if (wo.status === 'jha_approved') status = 'approved';
    if (wo.status === 'released') status = 'approved';
    const code = `JHA${wo.code.slice(-8)}`;
    return {
      code,
      status,
      prometheusStatusCode: status === 'raised' ? 'Raised' : status === 'approved' ? 'Approved' : 'Submitted',
      workOrderCode: wo.code,
      equipmentCode: wo.equipmentCode,
      workDescription: wo.description,
      equipmentDescription: wo.equipmentDescription,
      department: wo.department,
    };
  });
}

function mergeJhas(parsedJhas, synthesized) {
  const byCode = new Map();
  parsedJhas.forEach((j) => byCode.set(j.code, j));
  synthesized.forEach((j) => {
    if (byCode.has(j.code)) {
      const existing = byCode.get(j.code);
      byCode.set(j.code, { ...j, ...existing, workOrderCode: existing.workOrderCode || j.workOrderCode });
      return;
    }
    const linkedWo = j.workOrderCode;
    const duplicate = linkedWo && [...byCode.values()].some((x) => x.workOrderCode === linkedWo);
    if (!duplicate) byCode.set(j.code, j);
  });
  return [...byCode.values()];
}

function collectFiles(exportDir, prefix) {
  return fs.readdirSync(exportDir)
    .filter((f) => f.toUpperCase().startsWith(prefix.toUpperCase()) && f.endsWith('.txt'))
    .map((f) => path.join(exportDir, f));
}

function parseExportDirectory(exportDir) {
  const woFiles = ['WK1.HTML.txt', 'WK3.txt', 'WO2.txt', 'WO4.txt', 'WO5.txt'];
  const peFiles = ['summary1.html.txt', 'summary2.html.txt'];
  const isoFiles = [
    'isolation points1-22.txt',
    'isolation points 2-22.txt',
    'isolation points3-22.txt',
    'isolation points 4-22.txt',
  ];

  const workOrders = [];
  const permits = [];
  const isolationPoints = [];
  const equipment = [];
  const locations = [];
  const keySafes = [];
  const parsedJhas = [];
  const pageDataSources = [];

  const woSeen = new Set();
  const peSeen = new Set();
  const isoSeen = new Set();
  const equipSeen = new Set();
  const locSeen = new Set();
  const ksSeen = new Set();
  const jhaSeen = new Set();

  woFiles.forEach((fn) => {
    const fp = path.join(exportDir, fn);
    if (!fs.existsSync(fp)) return;
    const content = readExportFile(fp);
    pageDataSources.push(content);
    parseWorkOrders(content).forEach((row) => {
      if (!woSeen.has(row.code)) { woSeen.add(row.code); workOrders.push(row); }
    });
    parseJhasFromHtml(content).forEach((row) => {
      if (!jhaSeen.has(row.code)) { jhaSeen.add(row.code); parsedJhas.push(row); }
    });
  });

  const taskPlannerWos = [];
  collectFiles(exportDir, 'WO-task-planner').forEach((fp) => {
    const content = readExportFile(fp);
    pageDataSources.push(content);
    parseTaskPlannerWorkOrders(content).forEach((row) => taskPlannerWos.push(row));
  });
  if (taskPlannerWos.length) {
    const merged = mergeWorkOrders(workOrders, taskPlannerWos);
    workOrders.length = 0;
    woSeen.clear();
    merged.forEach((row) => {
      woSeen.add(row.code);
      workOrders.push(row);
    });
  }

  peFiles.forEach((fn) => {
    const fp = path.join(exportDir, fn);
    if (!fs.existsSync(fp)) return;
    const content = readExportFile(fp);
    pageDataSources.push(content);
    parseSafetyPermits(content).forEach((row) => {
      if (!peSeen.has(row.code)) { peSeen.add(row.code); permits.push(row); }
    });
    parseJhasFromHtml(content).forEach((row) => {
      if (!jhaSeen.has(row.code)) { jhaSeen.add(row.code); parsedJhas.push(row); }
    });
  });

  isoFiles.forEach((fn) => {
    const fp = path.join(exportDir, fn);
    if (!fs.existsSync(fp)) return;
    parseIsolationPoints(readExportFile(fp)).forEach((row) => {
      if (!isoSeen.has(row.code)) { isoSeen.add(row.code); isolationPoints.push(row); }
    });
  });

  collectFiles(exportDir, 'EQUIP').forEach((fp) => {
    parsePlantEquipment(readExportFile(fp)).forEach((row) => {
      if (!equipSeen.has(row.code)) { equipSeen.add(row.code); equipment.push(row); }
    });
  });

  const locPath = path.join(exportDir, 'LOCATIONS.txt');
  if (fs.existsSync(locPath)) {
    parseLocations(readExportFile(locPath)).forEach((row) => {
      if (!locSeen.has(row.code)) { locSeen.add(row.code); locations.push(row); }
    });
  }

  const ksPath = path.join(exportDir, 'keysafe.txt');
  if (fs.existsSync(ksPath)) {
    parseKeySafes(readExportFile(ksPath)).forEach((row) => {
      if (!ksSeen.has(row.code)) { ksSeen.add(row.code); keySafes.push(row); }
    });
  }

  let taskPlannerJhaCount = 0;
  const jhaTpPaths = [
    path.join(exportDir, 'JHA-task-planner.txt'),
    ...collectFiles(exportDir, 'JHA-task-planner'),
  ];
  const jhaTpSeen = new Set();
  jhaTpPaths.forEach((fp) => {
    if (!fs.existsSync(fp) || jhaTpSeen.has(fp)) return;
    jhaTpSeen.add(fp);
    parseJhasFromTaskPlanner(readExportFile(fp)).forEach((row) => {
      if (!jhaSeen.has(row.code)) {
        jhaSeen.add(row.code);
        parsedJhas.push(row);
        taskPlannerJhaCount += 1;
      }
    });
  });

  const pinboardPath = path.join(exportDir, 'safety permit page.txt');
  const pinboard = fs.existsSync(pinboardPath)
    ? parsePinboardSections(readExportFile(pinboardPath))
    : {};

  const jhaRefs = parseJhaReferencesFromPageData(pageDataSources);
  const synthesized = taskPlannerJhaCount
    ? []
    : synthesizeJhasFromWorkOrders(workOrders);
  const mergedJhas = mergeJhas(parsedJhas, synthesized);
  const jhas = linkJhasToWorkOrders(mergedJhas, workOrders);

  const workPacks = buildWorkPacks(workOrders, permits, jhas);
  const permitPackages = buildPermitPackages(workOrders, permits, jhas, workPacks);

  return {
    workOrders,
    permits,
    jhas,
    isolationPoints,
    equipment,
    locations,
    keySafes,
    permitPackages,
    workPacks,
    jhaRefs,
    pinboard,
    stats: {
      workOrders: workOrders.length,
      permits: permits.length,
      jhas: jhas.length,
      isolationPoints: isolationPoints.length,
      equipment: equipment.length,
      locations: locations.length,
      keySafes: keySafes.length,
      permitPackages: permitPackages.length,
      workPacks: workPacks.length,
      taskPlannerJhas: taskPlannerJhaCount,
    },
  };
}

module.exports = {
  parseWorkOrders,
  parseTaskPlannerWorkOrders,
  mergeWorkOrders,
  parseSafetyPermits,
  parseIsolationPoints,
  parsePlantEquipment,
  parseLocations,
  parseKeySafes,
  parseJhasFromHtml,
  parseJhasFromTaskPlanner,
  parseJhaTaskPlannerRow,
  parseJhaReferencesFromPageData,
  parsePinboardSections,
  synthesizeJhasFromWorkOrders,
  mergeJhas,
  parseExportDirectory,
};
