/** Display labels for PTW authorization keys (matches frontend matrix). */
const PTW_AUTH_ROLE_LABELS = {
  safetyCoordinator: 'Safety Coordinator',
  safetyControllerA: 'Safety Controller A',
  safetyControllerB: 'Safety Controller B',
  safetyControllerC: 'Safety Controller C',
  permitIssuer: 'Permit Issuer',
  isolationAuthority: 'Isolation Authority',
  skilledPerson: 'Skilled Person',
  permitReceiverStandard: 'Permit Receiver Standard',
  permitReceiverAccess: 'Permit Receiver Access',
  voltageLow: 'Voltage Low',
  voltageHigh: 'Voltage High',
  standbyPerson: 'Standby Person',
};

const PTW_AUTH_ROLE_ORDER = [
  'safetyCoordinator',
  'safetyControllerA',
  'safetyControllerB',
  'safetyControllerC',
  'permitIssuer',
  'isolationAuthority',
  'skilledPerson',
  'permitReceiverStandard',
  'permitReceiverAccess',
  'voltageLow',
  'voltageHigh',
  'standbyPerson',
];

function getPtwAuthRoleLabel(key) {
  return PTW_AUTH_ROLE_LABELS[key] || key;
}

function formatPtwAuthRoleName(authorizations) {
  if (!authorizations?.length) return 'PTW Authorization';
  const order = PTW_AUTH_ROLE_ORDER;
  const labels = [...authorizations]
    .sort((a, b) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    })
    .map(getPtwAuthRoleLabel);
  return labels.join(', ');
}

module.exports = {
  PTW_AUTH_ROLE_LABELS,
  getPtwAuthRoleLabel,
  formatPtwAuthRoleName,
};
