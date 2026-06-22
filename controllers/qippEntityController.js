const WorkOrder = require('../models/WorkOrder');

const JobHazardAnalysis = require('../models/JobHazardAnalysis');

const SafetyPermit = require('../models/SafetyPermit');

const IsolationPoint = require('../models/IsolationPoint');

const PermitPackage = require('../models/PermitPackage');

const Equipment = require('../models/Equipment');

const Location = require('../models/Location');

const KeySafe = require('../models/KeySafe');
const { nextPeSerialCode } = require('../utils/qippPeSerial');

const { DEPARTMENTS, displayWoStatus, displayPermitStatus, displayJhaStatus, isMainPermitType } = require('../constants/qippLifecycle');



function buildListFilter(query) {

  const filter = {};

  if (query.status) filter.status = query.status;

  if (query.department && DEPARTMENTS.includes(query.department)) {

    filter.department = query.department;

  }

  if (query.equipmentCode) filter.equipmentCode = new RegExp(query.equipmentCode, 'i');

  if (query.workOrderCode) filter.workOrderCode = query.workOrderCode;

  if (query.locationName) filter.locationName = new RegExp(query.locationName, 'i');

  if (query.q) {

    const re = new RegExp(query.q, 'i');

    filter.$or = [

      { code: re },

      { description: re },

      { name: re },

      { displayName: re },

    ];

  }

  return filter;

}



function paginate(query) {

  const limit = Math.min(parseInt(query.limit, 10) || 200, 1000);

  const skip = parseInt(query.skip, 10) || 0;

  return { limit, skip };

}



async function buildWorkPackForWorkOrder(wo) {

  const pkg = wo.permitPackageId

    ? await PermitPackage.findOne({ packageId: wo.permitPackageId }).lean()

    : null;



  let wp = pkg?.workPacks?.find((w) => w.workOrderCode === wo.code);

  if (!wp && pkg?.workPacks?.length) {

    wp = pkg.workPacks.find((w) => w.workOrderCode === wo.code) || pkg.workPacks[0];

  }



  const [jha, permit] = await Promise.all([

    wp?.jhaCode

      ? JobHazardAnalysis.findOne({ code: wp.jhaCode }).lean()

      : JobHazardAnalysis.findOne({ workOrderCode: wo.code }).lean(),

    wp?.permitCode

      ? SafetyPermit.findOne({ code: wp.permitCode }).lean()

      : SafetyPermit.findOne({ workOrderCode: wo.code, equipmentCode: wo.equipmentCode }).lean(),

  ]);



  return {

    packageId: pkg?.packageId || wo.permitPackageId || '',

    workOrder: { code: wo.code, status: wo.status, description: wo.description },

    jha: jha ? { code: jha.code, status: jha.status, workOrderCode: jha.workOrderCode } : null,

    permit: permit ? { code: permit.code, status: permit.status, typeLabel: permit.typeLabel } : null,

    links: wp || null,

  };

}



async function enrichPermitPackage(item) {

  const [workOrders, jhas, permits] = await Promise.all([

    WorkOrder.find({ code: { $in: item.workOrderCodes || [] } }).lean(),

    JobHazardAnalysis.find({ code: { $in: item.jhaCodes || [] } }).lean(),

    SafetyPermit.find({ code: { $in: item.permitCodes || [] } }).lean(),

  ]);

  return {

    ...item,

    workPack: {

      workPacks: item.workPacks || [],

      workOrders,

      jhas,

      permits,

    },

  };

}



exports.listWorkOrders = async (req, res) => {

  try {

    const filter = buildListFilter(req.query);

    const { limit, skip } = paginate(req.query);

    const [items, total] = await Promise.all([

      WorkOrder.find(filter).sort({ code: -1 }).skip(skip).limit(limit).lean(),

      WorkOrder.countDocuments(filter),

    ]);

    res.json({ items, total, limit, skip });

  } catch (error) {

    res.status(500).json({ message: error.message });

  }

};



exports.getWorkOrder = async (req, res) => {

  try {

    const item = await WorkOrder.findOne({ code: req.params.code }).lean();

    if (!item) return res.status(404).json({ message: 'Work order not found.' });

    const workPack = await buildWorkPackForWorkOrder(item);

    res.json({ ...item, workPack });

  } catch (error) {

    res.status(500).json({ message: error.message });

  }

};



exports.listJhas = async (req, res) => {

  try {

    const filter = buildListFilter(req.query);

    const { limit, skip } = paginate(req.query);

    const [items, total] = await Promise.all([

      JobHazardAnalysis.find(filter).sort({ code: -1 }).skip(skip).limit(limit).lean(),

      JobHazardAnalysis.countDocuments(filter),

    ]);

    res.json({ items, total, limit, skip });

  } catch (error) {

    res.status(500).json({ message: error.message });

  }

};



exports.getJha = async (req, res) => {

  try {

    const item = await JobHazardAnalysis.findOne({ code: req.params.code }).lean();

    if (!item) return res.status(404).json({ message: 'JHA not found.' });

    res.json(item);

  } catch (error) {

    res.status(500).json({ message: error.message });

  }

};



exports.listSafetyPermits = async (req, res) => {

  try {

    const filter = buildListFilter(req.query);

    if (req.query.typeCode) filter.typeCode = req.query.typeCode;

    const { limit, skip } = paginate(req.query);

    const [items, total] = await Promise.all([

      SafetyPermit.find(filter).sort({ code: -1 }).skip(skip).limit(limit).lean(),

      SafetyPermit.countDocuments(filter),

    ]);

    res.json({ items, total, limit, skip });

  } catch (error) {

    res.status(500).json({ message: error.message });

  }

};



exports.getSafetyPermit = async (req, res) => {

  try {

    const item = await SafetyPermit.findOne({ code: req.params.code }).lean();

    if (!item) return res.status(404).json({ message: 'Safety permit not found.' });

    res.json(item);

  } catch (error) {

    res.status(500).json({ message: error.message });

  }

};



exports.listIsolationPoints = async (req, res) => {

  try {

    const filter = buildListFilter(req.query);

    if (req.query.method) {

      filter.isolationMethodCode = new RegExp(req.query.method, 'i');

    }

    const { limit, skip } = paginate(req.query);

    const [items, total] = await Promise.all([

      IsolationPoint.find(filter).sort({ code: 1 }).skip(skip).limit(limit).lean(),

      IsolationPoint.countDocuments(filter),

    ]);

    res.json({ items, total, limit, skip });

  } catch (error) {

    res.status(500).json({ message: error.message });

  }

};



exports.getIsolationPoint = async (req, res) => {

  try {

    const item = await IsolationPoint.findOne({ code: req.params.code }).lean();

    if (!item) return res.status(404).json({ message: 'Isolation point not found.' });

    res.json(item);

  } catch (error) {

    res.status(500).json({ message: error.message });

  }

};



exports.listPermitPackages = async (req, res) => {

  try {

    const filter = buildListFilter(req.query);

    const { limit, skip } = paginate(req.query);

    const [items, total] = await Promise.all([

      PermitPackage.find(filter).sort({ packageId: 1 }).skip(skip).limit(limit).lean(),

      PermitPackage.countDocuments(filter),

    ]);

    res.json({ items, total, limit, skip });

  } catch (error) {

    res.status(500).json({ message: error.message });

  }

};



exports.getPermitPackage = async (req, res) => {

  try {

    const item = await PermitPackage.findOne({ packageId: req.params.packageId }).lean();

    if (!item) return res.status(404).json({ message: 'Permit package not found.' });

    res.json(await enrichPermitPackage(item));

  } catch (error) {

    res.status(500).json({ message: error.message });

  }

};



exports.listEquipment = async (req, res) => {

  try {

    const filter = buildListFilter(req.query);

    const { limit, skip } = paginate(req.query);

    const [items, total] = await Promise.all([

      Equipment.find(filter).sort({ code: 1 }).skip(skip).limit(limit).lean(),

      Equipment.countDocuments(filter),

    ]);

    res.json({ items, total, limit, skip });

  } catch (error) {

    res.status(500).json({ message: error.message });

  }

};



exports.getEquipment = async (req, res) => {

  try {

    const item = await Equipment.findOne({ code: req.params.code }).lean();

    if (!item) return res.status(404).json({ message: 'Equipment not found.' });

    res.json(item);

  } catch (error) {

    res.status(500).json({ message: error.message });

  }

};



exports.listLocations = async (req, res) => {

  try {

    const filter = buildListFilter(req.query);

    const { limit, skip } = paginate(req.query);

    const [items, total] = await Promise.all([

      Location.find(filter).sort({ code: 1 }).skip(skip).limit(limit).lean(),

      Location.countDocuments(filter),

    ]);

    res.json({ items, total, limit, skip });

  } catch (error) {

    res.status(500).json({ message: error.message });

  }

};



exports.getLocation = async (req, res) => {

  try {

    const item = await Location.findOne({ code: req.params.code }).lean();

    if (!item) return res.status(404).json({ message: 'Location not found.' });

    res.json(item);

  } catch (error) {

    res.status(500).json({ message: error.message });

  }

};



exports.listKeySafes = async (req, res) => {

  try {

    const filter = buildListFilter(req.query);

    const { limit, skip } = paginate(req.query);

    const [items, total] = await Promise.all([

      KeySafe.find(filter).sort({ code: 1 }).skip(skip).limit(limit).lean(),

      KeySafe.countDocuments(filter),

    ]);

    res.json({ items, total, limit, skip });

  } catch (error) {

    res.status(500).json({ message: error.message });

  }

};



exports.getNextPeCode = async (req, res) => {
  try {
    const code = await nextPeSerialCode();
    res.json({ code });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getKeySafe = async (req, res) => {

  try {

    const code = decodeURIComponent(req.params.code);

    const item = await KeySafe.findOne({ code }).lean();

    if (!item) return res.status(404).json({ message: 'Key safe not found.' });

    res.json(item);

  } catch (error) {

    res.status(500).json({ message: error.message });

  }

};



/** Map structured entities to legacy dashboard row shape for frontend tables. */

function woToRow(wo) {

  return {

    'WO No': wo.code,

    Status: displayWoStatus(wo.status) || wo.prometheusStatusCode,

    'Equipment No': wo.equipmentCode,

    'Work Desc': wo.description,

    'Equipment Desc': wo.equipmentDescription,

    'Planned Start': wo.plannedStart,

    'Planned Finish': wo.plannedFinish,

    Priority: wo.prometheusPriorityCode || wo.priority,

    Department: wo.department || '',

  };

}



function peToRow(pe) {

  return {

    'Doc No': pe.code,

    Status: displayPermitStatus(pe.status) || pe.prometheusStatusCode,

    Type: pe.typeLabel,

    'Equipment No': pe.equipmentCode,

    'Plant Summary': pe.equipmentDescription,

    'Work Desc': pe.workDescription,

    Location: pe.locationName,

    'Valid From': pe.validFrom,

    Workers: String(pe.numberOfWorkers ?? 0),

    Department: pe.department || '',

  };

}



function jhaToRow(jha) {

  return {

    'JHA No': jha.code,

    Status: jha.prometheusStatusCode || displayJhaStatus(jha.status),

    'WO No': jha.workOrderCode,

    Location: jha.locationName || '',

    'Equipment No': jha.equipmentCode,

    'Equipment Desc': jha.equipmentDescription || '',

    'Work Desc': jha.workDescription,

    Department: jha.department || '',

  };

}



function isoToRow(ip) {

  return {

    'Isolation Point No': ip.code,

    'Equipment No': ip.equipmentCode,

    'Isolation Method': ip.isolationMethodCode,

    'Isolation Desc': ip.description,

    Department: ip.department || '',

  };

}



function equipToRow(eq) {

  return {

    'Equipment No': eq.code,

    'Equipment Desc': eq.description,

    Location: eq.locationName,

    Team: eq.team,

    'Parent No': eq.parentEquipmentCode,

    Department: eq.department || '',

  };

}



function locationToRow(loc) {

  return {

    'Location Code': loc.code,

    'Location Name': loc.name,

    Summary: loc.summary,

    Department: loc.department || '',

  };

}



function keySafeSummaryRow(ks) {

  return {

    'Key Safe No': ks.displayName || ks.code,

    Status: ks.status,

    'Key Safe Desc': ks.description,

    Department: ks.department || '',

  };

}



function keySafeKeyRow(ks) {

  return {

    Ref: ks.code,

    'Key Safe No': ks.displayName || ks.code,

    'Key No': ks.keyCount ? String(ks.keyCount) : '—',

    'Secondary Key Safe': '',

    'Permit No': '',

    Locked: ks.status === 'In Use' || ks.status === 'InUse' ? 'Yes' : 'No',

    'Manual Key No': '',

    Department: ks.department || '',

  };

}



async function countByField(Model, field, match = {}) {

  const rows = await Model.aggregate([

    { $match: match },

    { $group: { _id: `$${field}`, count: { $sum: 1 } } },

  ]);

  const out = {};

  rows.forEach((r) => {

    if (r._id != null && r._id !== '') out[String(r._id)] = r.count;

  });

  return out;

}



exports.buildDashboardPayload = async (department) => {

  const deptFilter = department ? { department } : {};

  const [

    allPermits,

    workOrders,

    jhas,

    isolationPoints,

    equipment,

    locations,

    keySafes,

    permitStatusCounts,

    permitTypeCounts,

    jhaStatusCounts,

    woPriorityCounts,

    isoMethodCounts,

    ksStatusCounts,

  ] = await Promise.all([

    SafetyPermit.find(deptFilter).lean(),

    WorkOrder.find(deptFilter).lean(),

    JobHazardAnalysis.find(deptFilter).lean(),

    IsolationPoint.find(deptFilter).lean(),

    Equipment.find(deptFilter).lean(),

    Location.find(deptFilter).lean(),

    KeySafe.find(deptFilter).lean(),

    countByField(SafetyPermit, 'prometheusStatusCode', deptFilter),

    countByField(SafetyPermit, 'typeLabel', deptFilter),

    countByField(JobHazardAnalysis, 'prometheusStatusCode', deptFilter),

    countByField(WorkOrder, 'prometheusPriorityCode', deptFilter),

    countByField(IsolationPoint, 'isolationMethodCode', deptFilter),

    countByField(KeySafe, 'status', deptFilter),

  ]);



  const mainPermits = allPermits.filter((p) => isMainPermitType(p.typeLabel));

  const suppPermits = allPermits.filter((p) => !isMainPermitType(p.typeLabel));

  const workAssess = workOrders.filter((w) => w.status === 'raised');



  const suppTypeCounts = {};

  suppPermits.forEach((p) => {

    const k = p.typeLabel || '(blank)';

    suppTypeCounts[k] = (suppTypeCounts[k] || 0) + 1;

  });

  const suppStatusCounts = {};

  suppPermits.forEach((p) => {

    const k = p.prometheusStatusCode || displayPermitStatus(p.status);

    suppStatusCounts[k] = (suppStatusCounts[k] || 0) + 1;

  });



  return {

    source: 'mongodb',

    permits: mainPermits.map(peToRow),

    supps: suppPermits.map(peToRow),

    jha: jhas.map(jhaToRow),

    work_assess: workAssess.map(woToRow),

    work_all: workOrders.map(woToRow),

    plant: equipment.map(equipToRow),

    locations: locations.map(locationToRow),

    ks_summary: keySafes.map(keySafeSummaryRow),

    ks_keys: keySafes.map(keySafeKeyRow),

    iso: isolationPoints.map(isoToRow),

    charts: {

      permit_status: permitStatusCounts,

      permit_type: permitTypeCounts,

      supp_type: suppTypeCounts,

      supp_status: suppStatusCounts,

      jha_status: jhaStatusCounts,

      work_priority: woPriorityCounts,

      iso_method: isoMethodCounts,

      ks_status: ksStatusCounts,

    },

    counts: {

      workOrders: workOrders.length,

      permits: allPermits.length,

      jhas: jhas.length,

      isolationPoints: isolationPoints.length,

      equipment: equipment.length,

      locations: locations.length,

      keySafes: keySafes.length,

    },

    pinboard: {

      workOrders: await countByField(WorkOrder, 'prometheusStatusCode', deptFilter),

      permits: permitStatusCounts,

      jha: jhaStatusCounts,

    },

    department: department || undefined,

  };

};



exports.woToRow = woToRow;

exports.peToRow = peToRow;

exports.jhaToRow = jhaToRow;

exports.isoToRow = isoToRow;

exports.buildWorkPackForWorkOrder = buildWorkPackForWorkOrder;

