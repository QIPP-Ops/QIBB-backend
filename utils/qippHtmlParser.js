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
const { buildWorkPacks, buildPermitPackages } = require('./qippWorkPack');

function readExportFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function cleanCell(text) {
  return htmlUnescape(String(text || '').replace(/\s+/g, ' ').trim());
}

function deptFor(workDescription, equipmentCode, fallback = '') {
  return inferDepartment(workDescription, equipmentCode, fallback);
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
  synthesized.forEach((j) => byCode.set(j.code, j));
  parsedJhas.forEach((j) => {
    const existing = byCode.get(j.code);
    if (existing) {
      byCode.set(j.code, { ...existing, ...j, workOrderCode: j.workOrderCode || existing.workOrderCode });
    } else {
      byCode.set(j.code, j);
    }
  });
  // Also index synthesized by work order — prefer parsed when code differs
  const byWo = new Map();
  [...byCode.values()].forEach((j) => {
    if (j.workOrderCode) byWo.set(j.workOrderCode, j);
  });
  synthesized.forEach((j) => {
    if (!byWo.has(j.workOrderCode)) byWo.set(j.workOrderCode, j);
  });
  const merged = new Map(byCode);
  byWo.forEach((j, wo) => {
    if (![...merged.values()].some((x) => x.workOrderCode === wo)) {
      merged.set(j.code, j);
    }
  });
  return [...merged.values()];
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

  const pinboardPath = path.join(exportDir, 'safety permit page.txt');
  const pinboard = fs.existsSync(pinboardPath)
    ? parsePinboardSections(readExportFile(pinboardPath))
    : {};

  const jhaRefs = parseJhaReferencesFromPageData(pageDataSources);
  const synthesized = synthesizeJhasFromWorkOrders(workOrders);
  const jhas = mergeJhas(parsedJhas, synthesized);

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
    },
  };
}

module.exports = {
  parseWorkOrders,
  parseSafetyPermits,
  parseIsolationPoints,
  parsePlantEquipment,
  parseLocations,
  parseKeySafes,
  parseJhasFromHtml,
  parseJhaReferencesFromPageData,
  parsePinboardSections,
  synthesizeJhasFromWorkOrders,
  mergeJhas,
  parseExportDirectory,
};
