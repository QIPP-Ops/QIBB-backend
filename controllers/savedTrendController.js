const SavedTrend = require('../models/SavedTrend');
const { VALID_KINDS } = require('../services/plantReportsV3/schema');

const CHART_TYPES = ['line', 'bar', 'area'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function creatorEmail(req) {
  const email = req.user?.email ? String(req.user.email).trim().toLowerCase() : '';
  return email || null;
}

function validateSavedTrendBody(body, { isUpdate = false } = {}) {
  const errors = [];
  const src = body && typeof body === 'object' ? body : {};

  const name = src.name !== undefined ? String(src.name).trim() : isUpdate ? undefined : '';
  if (!isUpdate || src.name !== undefined) {
    if (!name) {
      errors.push('name must be a non-empty string');
    }
  }

  const kind = src.kind !== undefined ? String(src.kind).trim() : isUpdate ? undefined : '';
  if (!isUpdate || src.kind !== undefined) {
    if (!kind || !VALID_KINDS.includes(kind)) {
      errors.push(`kind must be one of: ${VALID_KINDS.join(', ')}`);
    }
  }

  const metric = src.metric !== undefined ? String(src.metric).trim() : isUpdate ? undefined : '';
  if (!isUpdate || src.metric !== undefined) {
    if (!metric) {
      errors.push('metric must be a non-empty string');
    }
  }

  if (!isUpdate || src.units !== undefined) {
    if (!Array.isArray(src.units) || src.units.length === 0) {
      errors.push('units must be a non-empty array');
    } else if (!src.units.every((u) => typeof u === 'string' && String(u).trim().length > 0)) {
      errors.push('units must contain only non-empty strings');
    }
  }

  if (src.chartType !== undefined) {
    if (!CHART_TYPES.includes(src.chartType)) {
      errors.push(`chartType must be one of: ${CHART_TYPES.join(', ')}`);
    }
  } else if (!isUpdate) {
    // default applied on create
  }

  if (src.from !== undefined && src.from !== null && src.from !== '') {
    if (typeof src.from !== 'string' || !DATE_RE.test(src.from)) {
      errors.push('from must be an ISO date string (YYYY-MM-DD) or null');
    }
  }

  if (src.to !== undefined && src.to !== null && src.to !== '') {
    if (typeof src.to !== 'string' || !DATE_RE.test(src.to)) {
      errors.push('to must be an ISO date string (YYYY-MM-DD) or null');
    }
  }

  if (src.rollingDays !== undefined && src.rollingDays !== null) {
    const n = Number(src.rollingDays);
    if (!Number.isFinite(n) || n < 1) {
      errors.push('rollingDays must be a positive number');
    }
  }

  if (errors.length > 0) {
    return { valid: false, message: errors.join('; ') };
  }

  return { valid: true, name, kind, metric };
}

function buildPayload(body) {
  const from =
    body.from === undefined || body.from === null || body.from === ''
      ? null
      : String(body.from).slice(0, 10);
  const to =
    body.to === undefined || body.to === null || body.to === ''
      ? null
      : String(body.to).slice(0, 10);

  return {
    name: String(body.name).trim(),
    kind: String(body.kind).trim(),
    metric: String(body.metric).trim(),
    units: body.units.map((u) => String(u).trim()),
    chartType: body.chartType || 'line',
    from,
    to,
    rollingDays:
      body.rollingDays !== undefined && body.rollingDays !== null
        ? Number(body.rollingDays)
        : 30,
    showOnHomePage: Boolean(body.showOnHomePage),
  };
}

exports.listSavedTrends = async (req, res) => {
  try {
    const docs = await SavedTrend.find().sort({ createdAt: -1 }).lean();
    return res.json({ success: true, data: docs });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Failed to list saved trends' });
  }
};

exports.createSavedTrend = async (req, res) => {
  try {
    const email = creatorEmail(req);
    if (!email) {
      return res.status(400).json({ message: 'Authenticated user email is required' });
    }

    const validation = validateSavedTrendBody(req.body, { isUpdate: false });
    if (!validation.valid) {
      return res.status(400).json({ message: validation.message });
    }

    const payload = buildPayload(req.body);
    const doc = await SavedTrend.create({
      ...payload,
      createdBy: email,
    });

    return res.status(201).json({ success: true, data: doc });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Failed to create saved trend' });
  }
};

exports.updateSavedTrend = async (req, res) => {
  try {
    const validation = validateSavedTrendBody(req.body, { isUpdate: false });
    if (!validation.valid) {
      return res.status(400).json({ message: validation.message });
    }

    const doc = await SavedTrend.findByIdAndUpdate(
      req.params.id,
      { $set: buildPayload(req.body) },
      { new: true, runValidators: true },
    );

    if (!doc) {
      return res.status(404).json({ message: 'Saved trend not found' });
    }

    return res.json({ success: true, data: doc });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Failed to update saved trend' });
  }
};

exports.deleteSavedTrend = async (req, res) => {
  try {
    const doc = await SavedTrend.findByIdAndDelete(req.params.id);
    if (!doc) {
      return res.status(404).json({ message: 'Saved trend not found' });
    }
    return res.json({ success: true, data: { id: doc._id } });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Failed to delete saved trend' });
  }
};

exports.toggleHomePage = async (req, res) => {
  try {
    const existing = await SavedTrend.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ message: 'Saved trend not found' });
    }

    const doc = await SavedTrend.findByIdAndUpdate(
      req.params.id,
      { $set: { showOnHomePage: !existing.showOnHomePage } },
      { new: true },
    );

    return res.json({ success: true, data: doc });
  } catch (err) {
    return res.status(500).json({ message: err.message || 'Failed to toggle home page flag' });
  }
};
