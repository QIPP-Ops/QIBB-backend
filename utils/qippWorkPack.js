/** Work-pack linking helpers: text similarity and date proximity. */

const MONTHS = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

function normalizeWorkText(text) {
  return String(text || '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function workDescTokens(text) {
  const norm = normalizeWorkText(text);
  if (!norm) return new Set();
  return new Set(norm.split(' ').filter((t) => t.length > 2));
}

function workDescScore(a, b) {
  const ta = workDescTokens(a);
  const tb = workDescTokens(b);
  if (!ta.size || !tb.size) return 0;
  let overlap = 0;
  ta.forEach((t) => { if (tb.has(t)) overlap += 1; });
  return overlap / Math.max(ta.size, tb.size);
}

function parsePrometheusDate(s) {
  const m = String(s || '').match(/(\d{1,2})\s+(\w{3})\s+(\d{4})/);
  if (!m) return null;
  const mon = MONTHS[m[2]];
  if (mon == null) return null;
  return new Date(parseInt(m[3], 10), mon, parseInt(m[1], 10));
}

function daysApart(a, b) {
  const da = parsePrometheusDate(a);
  const db = parsePrometheusDate(b);
  if (!da || !db) return Infinity;
  return Math.abs(da.getTime() - db.getTime()) / (24 * 60 * 60 * 1000);
}

function bestWorkOrderForPermit(permit, workOrders) {
  const candidates = workOrders.filter((wo) =>
    wo.equipmentCode && wo.equipmentCode === permit.equipmentCode
  );
  if (!candidates.length) return null;

  let best = null;
  let bestScore = -1;
  candidates.forEach((wo) => {
    const descScore = workDescScore(wo.description, permit.workDescription);
    const datePenalty = daysApart(wo.plannedStart, permit.validFrom);
    const dateScore = datePenalty <= 7 ? 1 : datePenalty <= 30 ? 0.5 : datePenalty <= 90 ? 0.2 : 0;
    const score = descScore * 0.7 + dateScore * 0.3;
    if (score > bestScore) {
      bestScore = score;
      best = wo;
    }
  });
  return bestScore > 0.05 ? best : candidates[0];
}

function bestJhaForWorkOrder(jhas, wo) {
  if (!wo) return null;
  const byWo = jhas.find((j) => j.workOrderCode === wo.code);
  if (byWo) return byWo;
  const candidates = jhas.filter((j) => j.equipmentCode === wo.equipmentCode);
  if (!candidates.length) return null;
  let best = null;
  let bestScore = -1;
  candidates.forEach((j) => {
    const score = workDescScore(j.workDescription, wo.description);
    if (score > bestScore) { bestScore = score; best = j; }
  });
  return best;
}

function buildWorkPacks(workOrders, permits, jhas) {
  const packs = [];
  const usedWo = new Set();
  const usedJha = new Set();
  const usedPe = new Set();

  permits.forEach((pe) => {
    const wo = bestWorkOrderForPermit(pe, workOrders);
    const jha = bestJhaForWorkOrder(jhas, wo);
    if (wo) {
      pe.workOrderCode = wo.code;
      usedWo.add(wo.code);
    }
    if (jha) {
      pe.jhaCode = jha.code;
      usedJha.add(jha.code);
    }
    usedPe.add(pe.code);
    packs.push({
      workOrderCode: wo?.code || '',
      jhaCode: jha?.code || '',
      permitCode: pe.code,
      equipmentCode: pe.equipmentCode || wo?.equipmentCode || '',
    });
  });

  // Orphan WOs with JHAs but no permit
  jhas.forEach((jha) => {
    if (usedJha.has(jha.code)) return;
    const wo = workOrders.find((w) => w.code === jha.workOrderCode);
    if (wo && !usedWo.has(wo.code)) {
      packs.push({
        workOrderCode: wo.code,
        jhaCode: jha.code,
        permitCode: '',
        equipmentCode: wo.equipmentCode,
      });
      usedWo.add(wo.code);
      usedJha.add(jha.code);
    }
  });

  return packs;
}

function buildPermitPackages(workOrders, permits, jhas, workPacks) {
  const byEquipment = new Map();

  function ensurePkg(equipmentCode) {
    const key = equipmentCode || 'UNKNOWN';
    if (!byEquipment.has(key)) {
      byEquipment.set(key, {
        packageId: `PKG-${key.replace(/[^A-Za-z0-9]/g, '').slice(0, 20)}-${byEquipment.size + 1}`,
        equipmentCode: key,
        workOrderCodes: [],
        jhaCodes: [],
        permitCodes: [],
        workPacks: [],
        department: null,
      });
    }
    return byEquipment.get(key);
  }

  function addUnique(arr, val) {
    if (val && !arr.includes(val)) arr.push(val);
  }

  workPacks.forEach((wp) => {
    const pkg = ensurePkg(wp.equipmentCode);
    addUnique(pkg.workOrderCodes, wp.workOrderCode);
    addUnique(pkg.jhaCodes, wp.jhaCode);
    addUnique(pkg.permitCodes, wp.permitCode);
    pkg.workPacks.push({
      workOrderCode: wp.workOrderCode,
      jhaCode: wp.jhaCode,
      permitCode: wp.permitCode,
    });
  });

  workOrders.forEach((wo) => {
    const pkg = ensurePkg(wo.equipmentCode);
    addUnique(pkg.workOrderCodes, wo.code);
    if (wo.department) pkg.department = wo.department;
  });

  jhas.forEach((jha) => {
    const pkg = ensurePkg(jha.equipmentCode);
    addUnique(pkg.jhaCodes, jha.code);
    if (jha.department) pkg.department = jha.department;
  });

  permits.forEach((pe) => {
    const pkg = ensurePkg(pe.equipmentCode);
    addUnique(pkg.permitCodes, pe.code);
    if (pe.department) pkg.department = pe.department;
  });

  return [...byEquipment.values()].filter(
    (p) => p.workOrderCodes.length || p.permitCodes.length || p.jhaCodes.length
  );
}

function bestWorkOrderForJha(jha, workOrders) {
  if (!jha?.equipmentCode) return null;
  const candidates = workOrders.filter((wo) => wo.equipmentCode === jha.equipmentCode);
  if (!candidates.length) return null;
  let best = null;
  let bestScore = -1;
  candidates.forEach((wo) => {
    const score = workDescScore(jha.workDescription, wo.description);
    if (score > bestScore) {
      bestScore = score;
      best = wo;
    }
  });
  return bestScore > 0.05 ? best : candidates[0];
}

function linkJhasToWorkOrders(jhas, workOrders) {
  return jhas.map((jha) => {
    if (jha.workOrderCode) return jha;
    const wo = bestWorkOrderForJha(jha, workOrders);
    if (!wo) return jha;
    return { ...jha, workOrderCode: wo.code };
  });
}

module.exports = {
  normalizeWorkText,
  workDescScore,
  parsePrometheusDate,
  daysApart,
  bestWorkOrderForJha,
  linkJhasToWorkOrders,
  buildWorkPacks,
  buildPermitPackages,
};
