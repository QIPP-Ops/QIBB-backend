const {
  raiseWorkflow,
  advanceWorkflow,
  archiveWorkflow,
  listWorkflows,
} = require('../services/ptwWorkflowService');

exports.list = async (req, res) => {
  try {
    const archived = req.query.archived === 'true' || req.query.archived === '1';
    const items = await listWorkflows({ archived });
    res.json({ success: true, data: items });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.raise = async (req, res) => {
  try {
    const { title, body, department, equipment, priority, location } = req.body || {};
    if (!title?.trim()) {
      return res.status(400).json({ message: 'title is required.' });
    }
    const doc = await raiseWorkflow({
      title,
      body,
      department,
      equipment,
      priority,
      location,
      user: req.user,
    });
    res.status(201).json({ success: true, data: doc });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.advance = async (req, res) => {
  try {
    const doc = await advanceWorkflow(req.params.id, {
      ...req.body,
      user: req.user,
    });
    if (!doc) return res.status(404).json({ message: 'Workflow not found.' });
    res.json({ success: true, data: doc });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
};

exports.archive = async (req, res) => {
  try {
    const { reason, terminalStatus } = req.body || {};
    const doc = await archiveWorkflow(req.params.id, {
      reason,
      terminalStatus,
      user: req.user,
    });
    if (!doc) return res.status(404).json({ message: 'Workflow not found.' });
    res.json({ success: true, data: doc });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
