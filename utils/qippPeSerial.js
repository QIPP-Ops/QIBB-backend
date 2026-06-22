const SafetyPermit = require('../models/SafetyPermit');

/** Next PE###### code from max imported SafetyPermit code (PE + 6 digits). */
async function nextPeSerialCode() {
  const permits = await SafetyPermit.find({ code: /^PE\d{6}$/ })
    .select('code')
    .lean();
  let max = 0;
  permits.forEach((p) => {
    const n = parseInt(String(p.code).slice(2), 10);
    if (Number.isFinite(n) && n > max) max = n;
  });
  return `PE${String(max + 1).padStart(6, '0')}`;
}

module.exports = { nextPeSerialCode };
