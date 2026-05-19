function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, data });
}

function fail(res, message, status = 500, extra = {}) {
  return res.status(status).json({ success: false, message, ...extra });
}

module.exports = { ok, fail };
