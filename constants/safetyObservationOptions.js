/** Synergi-aligned picklists for Safety Observations (Event Reporting - Observation). */

const SAFETY_CATEGORIES = [
  'Positive Observation',
  'Suggestion/Complaints',
  'Unsafe act',
  'Unsafe condition',
];

const RISK_CATEGORIES = [
  { code: '01', label: 'Work at Height' },
  { code: '02', label: 'Excavation' },
  { code: '03', label: 'Man Machine Interface' },
  { code: '04', label: 'Lifting/Rigging' },
  { code: '05', label: 'Confined Space' },
  { code: '06', label: 'Hot Work' },
  { code: '07', label: 'Electrical' },
  { code: '08', label: 'Process' },
  { code: '09', label: 'Chemicals' },
  { code: '10', label: 'Environmental' },
  { code: '11', label: 'Welfare' },
  { code: '12', label: 'Ergonomics' },
  {
    code: '13',
    label: 'General',
    children: [
      { code: '13.defective', label: 'Defective tools/equipment' },
      { code: '13.heat', label: 'Heat stress' },
      { code: '13.housekeeping', label: 'Housekeeping' },
      { code: '13.line_of_fire', label: 'Line of Fire' },
      { code: '13.noise', label: 'Occupational Noise' },
      { code: '13.ppe', label: "PPE's Non-Compliance" },
      { code: '13.ptw_sop', label: 'PTW & SOP Non-Compliance' },
      { code: '13.signages', label: 'Safety Signages' },
      { code: '13.security', label: 'Security Risk' },
      { code: '13.slip_trip', label: 'Slip Trip Fall' },
      { code: '13.supervision', label: 'Supervision' },
      { code: '13.training', label: 'Training/Competency' },
    ],
  },
];

const POTENTIAL_CAUSES = [
  'Human error',
  'Equipment failure',
  'Inadequate procedure',
  'Inadequate training',
  'Inadequate supervision',
  'Environmental conditions',
  'Design deficiency',
  'Maintenance deficiency',
  'Communication failure',
  'Other',
];

const HOW_REVEALED_OPTIONS = [
  'Routine inspection',
  'Safety walk',
  'Audit',
  'Incident investigation',
  'Employee report',
  'Contractor report',
  'Management observation',
  'Near miss report',
  'Other',
];

const RESPONSIBLE_DEPARTMENTS = [
  'Operation',
  'LAB',
  'Maintenance',
  'HSE',
  'Projects',
  'QIPP',
  'Utilities',
  'Other',
];

const PROJECT_STATUS_OPTIONS = [
  'Ongoing',
  'Completed',
  'On hold',
  'Not applicable',
];

const DEFAULT_LOCATION = 'KSA - KSA - QIPP / SIWPP plant areas';
const DEFAULT_REPORTED_BY_COMPANY = 'ACWA';
const DEFAULT_RESPONSIBLE_DEPARTMENT = 'Operation';
const DEFAULT_REPORTED_BY_DEPARTMENT = 'Operation';

const MONTHLY_MINIMUM = 2;

const INCENTIVE_TIERS = [
  { id: 'tier_100', label: '100 SAR gift card', threshold: 100, consecutiveMonths: 1 },
  { id: 'tier_500', label: '500 SAR gift card', threshold: 500, consecutiveMonths: 2 },
  { id: 'tier_1000', label: '1000 SAR gift card', threshold: 1000, consecutiveMonths: 3 },
];

function flattenRiskCategories() {
  const flat = [];
  for (const cat of RISK_CATEGORIES) {
    flat.push({ code: cat.code, label: `${cat.code}.${cat.label}` });
    if (Array.isArray(cat.children)) {
      for (const child of cat.children) {
        flat.push({ code: child.code, label: child.label, parent: cat.code });
      }
    }
  }
  return flat;
}

module.exports = {
  SAFETY_CATEGORIES,
  RISK_CATEGORIES,
  POTENTIAL_CAUSES,
  HOW_REVEALED_OPTIONS,
  RESPONSIBLE_DEPARTMENTS,
  PROJECT_STATUS_OPTIONS,
  DEFAULT_LOCATION,
  DEFAULT_REPORTED_BY_COMPANY,
  DEFAULT_RESPONSIBLE_DEPARTMENT,
  DEFAULT_REPORTED_BY_DEPARTMENT,
  MONTHLY_MINIMUM,
  INCENTIVE_TIERS,
  flattenRiskCategories,
};
