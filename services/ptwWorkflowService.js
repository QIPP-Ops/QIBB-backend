const PtwWorkflow = require('../models/PtwWorkflow');
const { createNotification } = require('./notificationService');

function pushHistory(doc, entry) {
  if (!doc.history) doc.history = [];
  doc.history.push({ ...entry, at: new Date() });
}

async function nextWorkflowId() {
  const count = await PtwWorkflow.countDocuments();
  const year = new Date().getFullYear();
  return `WF-${year}-${String(count + 1).padStart(5, '0')}`;
}

async function notifyWorkflowActor(recipientUserId, workflow, title, body) {
  if (!recipientUserId) return;
  try {
    await createNotification({
      type: 'ptw_expiry',
      recipientUserId,
      title,
      body,
      link: '/ptw',
      metadata: { workflowId: workflow.workflowId, status: workflow.status },
      dedupeKey: `workflow:${workflow.workflowId}:${workflow.status}:${title}`,
    });
  } catch (err) {
    console.warn('[ptwWorkflow] notification failed:', err.message);
  }
}

async function raiseWorkflow({ title, body, department, equipment, priority, location, user }) {
  const workflowId = await nextWorkflowId();
  const doc = await PtwWorkflow.create({
    workflowId,
    status: 'notification',
    title: String(title || '').trim() || 'Maintenance notification',
    body: String(body || '').trim(),
    department: String(department || '').trim(),
    equipment: String(equipment || '').trim(),
    priority: String(priority || '').trim(),
    location: String(location || '').trim(),
    raisedBy: user?.name || user?.displayName || '',
    raisedByEmail: user?.email || '',
    history: [
      {
        at: new Date(),
        by: user?.email || user?.name || 'system',
        action: 'raised',
        fromStatus: '',
        toStatus: 'notification',
        note: 'Notification raised',
      },
    ],
  });

  const userId = user?.userId || user?.id;
  if (userId) {
    await notifyWorkflowActor(
      userId,
      doc,
      `Workflow ${workflowId} — notification raised`,
      doc.title
    );
  }

  return doc;
}

async function advanceWorkflow(id, { status, workOrderNumber, jhaCode, permitId, note, user }) {
  const doc = await PtwWorkflow.findById(id);
  if (!doc) return null;
  if (doc.status === 'history' || doc.status === 'cancelled') {
    const err = new Error('Workflow is already archived.');
    err.statusCode = 400;
    throw err;
  }

  const fromStatus = doc.status;
  const nextStatus = String(status || '').trim();
  const allowed = {
    notification: ['work_order'],
    work_order: ['jha'],
    jha: ['ptw'],
    ptw: ['history', 'cancelled'],
  };
  const validNext = allowed[fromStatus] || [];
  if (!validNext.includes(nextStatus)) {
    const err = new Error(`Cannot transition from ${fromStatus} to ${nextStatus}.`);
    err.statusCode = 400;
    throw err;
  }

  if (workOrderNumber) doc.workOrderNumber = String(workOrderNumber).trim();
  if (jhaCode) doc.jhaCode = String(jhaCode).trim();
  if (permitId) doc.permitId = String(permitId).trim();

  doc.status = nextStatus;
  if (nextStatus === 'history' || nextStatus === 'cancelled') {
    doc.archivedAt = new Date();
  }

  pushHistory(doc, {
    by: user?.email || user?.name || 'system',
    action: 'advance',
    fromStatus,
    toStatus: nextStatus,
    note: note || '',
  });

  await doc.save();

  const userId = user?.userId || user?.id;
  if (userId) {
    await notifyWorkflowActor(
      userId,
      doc,
      `Workflow ${doc.workflowId} — ${nextStatus.replace(/_/g, ' ')}`,
      doc.title
    );
  }

  return doc;
}

async function archiveWorkflow(id, { reason, user, terminalStatus = 'history' }) {
  const doc = await PtwWorkflow.findById(id);
  if (!doc) return null;
  if (doc.status === 'history' || doc.status === 'cancelled') return doc;

  const fromStatus = doc.status;
  const toStatus = terminalStatus === 'cancelled' ? 'cancelled' : 'history';
  doc.status = toStatus;
  doc.archivedAt = new Date();
  pushHistory(doc, {
    by: user?.email || user?.name || 'system',
    action: reason || 'archive',
    fromStatus,
    toStatus,
    note: reason || '',
  });
  await doc.save();
  return doc;
}

async function listWorkflows({ archived = false, limit = 100 } = {}) {
  const filter = archived
    ? { status: { $in: ['history', 'cancelled'] } }
    : { status: { $nin: ['history', 'cancelled'] } };
  return PtwWorkflow.find(filter).sort({ updatedAt: -1 }).limit(limit).lean();
}

module.exports = {
  raiseWorkflow,
  advanceWorkflow,
  archiveWorkflow,
  listWorkflows,
};
