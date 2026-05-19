/** Engica / Q4 Safety permit types (no "Cold Work"). */
const PERMIT_TYPES = [
  { code: 'CSEP', label: 'Confined Space Entry Permit' },
  { code: 'DMP', label: 'Diving and Marine Permit' },
  { code: 'ECP', label: 'Excavation and Civil Permit' },
  { code: 'HWP', label: 'Hot Work Permit' },
  { code: 'LP', label: 'Lifting Permit' },
  { code: 'LWP', label: 'Live Work Permit (Legacy Document)' },
  { code: 'AAA', label: 'PERMIT (Access)' },
  { code: 'AAL', label: 'PERMIT (Live)' },
  { code: 'AAR', label: 'PERMIT (ROSH)' },
  { code: 'AAS', label: 'PERMIT (Standard)' },
  { code: 'AAT', label: 'PERMIT (Test)' },
  { code: 'PTW', label: 'Permit To Work' },
  { code: 'SP', label: 'Simulation Permit' },
  { code: 'WHP', label: 'Work at Height Permit' },
];

const PERMIT_TYPE_LABELS = PERMIT_TYPES.map((p) => p.label);
const PERMIT_TYPE_CODES = PERMIT_TYPES.map((p) => p.code);

/** Workflow statuses aligned with Engica + QIPP process. */
const PERMIT_STATUSES = [
  'ready_to_prepare',
  'prepared',
  'issued',
  'suspended',
  'surrendered',
  'cancelled',
  'closed',
];

const JHA_STATUSES = ['not_started', 'submitted', 'approved', 'rejected'];

module.exports = {
  PERMIT_TYPES,
  PERMIT_TYPE_LABELS,
  PERMIT_TYPE_CODES,
  PERMIT_STATUSES,
  JHA_STATUSES,
};
