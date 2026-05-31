/** Canonical leave type labels (SAP Leave removed; use appliedOnSap flag instead). */
const LEAVE_TYPES = [
  'Planned',
  'Sick',
  'Emergency',
  'Annual Leave',
  'Bank Leave',
  'Compensate Off',
  'Compassionate Leave',
  'Marriage Leave',
  'Paternity Leave',
  'Academic Leave',
];

const BALANCE_LEAVE_TYPES = new Set(['Annual Leave', 'Bank Leave']);

function isBalanceLeaveType(type) {
  return BALANCE_LEAVE_TYPES.has(String(type || '').trim());
}

function isAnnualLeaveType(type) {
  return String(type || '').trim() === 'Annual Leave';
}

function isBankLeaveType(type) {
  return String(type || '').trim() === 'Bank Leave';
}

/** Legacy roster data used "Applied on SAP" / "SAP leave" as types — map for display only. */
function normalizeLeaveType(type) {
  const t = String(type || 'Planned').trim();
  if (/^applied on sap$/i.test(t) || /^sap leave$/i.test(t)) return 'Planned';
  return t;
}

module.exports = {
  LEAVE_TYPES,
  BALANCE_LEAVE_TYPES,
  isBalanceLeaveType,
  isAnnualLeaveType,
  isBankLeaveType,
  normalizeLeaveType,
};
