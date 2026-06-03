/** Canonical leave type labels (SAP Leave removed; use appliedOnSap flag instead). */
const LEAVE_TYPES = [
  'Planned',
  'Sick',
  'Emergency',
  'Annual Leave',
  'Annual Leave - Carry Forward Previous Year',
  'Bank Leave',
  'Compensate Off',
  'Compassionate Leave',
  'Marriage Leave',
  'Paternity Leave',
  'Academic Leave',
];

const BALANCE_LEAVE_TYPES = new Set(['Annual Leave', 'Bank Leave']);

const ANNUAL_LEAVE_TYPES = new Set([
  'Annual Leave',
  'Annual Leave - Carry Forward Previous Year',
]);

const LEGACY_COMPENSATE_LEAVE = 'Compensate Leave Balance';

function normalizeCompensateLeaveType(type) {
  const t = String(type || '').trim();
  if (t === LEGACY_COMPENSATE_LEAVE) return 'Compensate Off';
  return t;
}

function isBalanceLeaveType(type) {
  return BALANCE_LEAVE_TYPES.has(normalizeCompensateLeaveType(type));
}

function isAnnualLeaveType(type) {
  return ANNUAL_LEAVE_TYPES.has(String(type || '').trim());
}

function isCompensateLeaveType(type) {
  return normalizeCompensateLeaveType(type) === 'Compensate Off';
}

function isBankLeaveType(type) {
  return String(type || '').trim() === 'Bank Leave';
}

/** Legacy roster data used "Applied on SAP" / "SAP leave" as types — map for display only. */
function normalizeLeaveType(type) {
  const t = normalizeCompensateLeaveType(String(type || 'Planned').trim());
  if (/^applied on sap$/i.test(t) || /^sap leave$/i.test(t)) return 'Planned';
  return t;
}

module.exports = {
  LEAVE_TYPES,
  BALANCE_LEAVE_TYPES,
  ANNUAL_LEAVE_TYPES,
  LEGACY_COMPENSATE_LEAVE,
  normalizeCompensateLeaveType,
  isBalanceLeaveType,
  isAnnualLeaveType,
  isBankLeaveType,
  isCompensateLeaveType,
  normalizeLeaveType,
};
