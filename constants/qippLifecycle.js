/** Prometheus → QIPP canonical lifecycle mappings (Phase A). */

const DEPARTMENTS = ['MMD', 'EMD', 'IMD'];

const WORK_ORDER_STATUSES = ['raised', 'jha_assigned', 'jha_approved', 'released', 'closed'];

const JHA_STATUSES = ['raised', 'submitted', 'approved', 'rejected'];

const SAFETY_PERMIT_STATUSES = [
  'in_preparation',
  'prepared',
  'issued',
  'suspended',
  'surrendered',
  'cancelled',
  'cleared',
  'closed',
];

const PROMETHEUS_WO_STATUS_MAP = {
  Raised: 'raised',
  JHAAssigned: 'jha_assigned',
  APQ4: 'jha_approved',
  RLQ4: 'released',
  CLQ4: 'closed',
};

const PROMETHEUS_JHA_STATUS_MAP = {
  Raised: 'raised',
  Submitted: 'submitted',
  Approved: 'approved',
  Rejected: 'rejected',
};

const PROMETHEUS_PERMIT_STATUS_MAP = {
  'In Preparation': 'in_preparation',
  Prepared: 'prepared',
  Issued: 'issued',
  Suspended: 'suspended',
  Surrendered: 'surrendered',
  Cancelled: 'cancelled',
  Cleared: 'cleared',
  Closed: 'closed',
};

const PROMETHEUS_PRIORITY_MAP = {
  Low: 'low',
  Medium: 'medium',
  High: 'high',
  Emergency: 'emergency',
  Shutdown: 'shutdown',
};

const PERMIT_TYPE_LABEL_TO_CODE = {
  'Permit To Work': 'PTW',
  'PERMIT (Standard)': 'AAS',
  'PERMIT (Access)': 'AAA',
  'PERMIT (Live)': 'AAL',
  'PERMIT (ROSH)': 'AAR',
  'PERMIT (Test)': 'AAT',
  'Confined Space Entry Permit': 'CSEP',
  'Excavation and Civil Permit': 'ECP',
  'Hot Work Permit': 'HWP',
  'Lifting Permit': 'LP',
  'Work at Height Permit': 'WHP',
  'Simulation Permit': 'SP',
  'Live Work Permit (Legacy Document)': 'LWP',
};

const MAIN_PERMIT_TYPES = new Set(['Permit To Work', 'PERMIT (Standard)']);

function mapWoStatus(prometheusCode) {
  return PROMETHEUS_WO_STATUS_MAP[prometheusCode] || 'raised';
}

function mapJhaStatus(prometheusCode) {
  return PROMETHEUS_JHA_STATUS_MAP[prometheusCode] || 'raised';
}

function mapPermitStatus(prometheusCode) {
  return PROMETHEUS_PERMIT_STATUS_MAP[prometheusCode] || 'in_preparation';
}

function mapPriority(prometheusCode) {
  return PROMETHEUS_PRIORITY_MAP[prometheusCode] || 'low';
}

function permitTypeCode(typeLabel) {
  return PERMIT_TYPE_LABEL_TO_CODE[typeLabel] || 'PTW';
}

function isMainPermitType(typeLabel) {
  return MAIN_PERMIT_TYPES.has(typeLabel) || typeLabel === 'Permit To Work';
}

function displayWoStatus(status) {
  const rev = Object.fromEntries(
    Object.entries(PROMETHEUS_WO_STATUS_MAP).map(([k, v]) => [v, k])
  );
  return rev[status] || status;
}

function displayPermitStatus(status) {
  const rev = Object.fromEntries(
    Object.entries(PROMETHEUS_PERMIT_STATUS_MAP).map(([k, v]) => [v, k])
  );
  return rev[status] || status;
}

function displayJhaStatus(status) {
  const rev = Object.fromEntries(
    Object.entries(PROMETHEUS_JHA_STATUS_MAP).map(([k, v]) => [v, k])
  );
  return rev[status] || status;
}

module.exports = {
  DEPARTMENTS,
  WORK_ORDER_STATUSES,
  JHA_STATUSES,
  SAFETY_PERMIT_STATUSES,
  PROMETHEUS_WO_STATUS_MAP,
  PROMETHEUS_JHA_STATUS_MAP,
  PROMETHEUS_PERMIT_STATUS_MAP,
  mapWoStatus,
  mapJhaStatus,
  mapPermitStatus,
  mapPriority,
  permitTypeCode,
  isMainPermitType,
  displayWoStatus,
  displayPermitStatus,
  displayJhaStatus,
};
