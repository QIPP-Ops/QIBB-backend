jest.mock('../models/PtwWorkflow', () => {
  const store = [];
  const model = {
    create: jest.fn(async (doc) => {
      const row = { _id: `wf-${store.length + 1}`, ...doc, save: jest.fn(async function () { return this; }) };
      store.push(row);
      return row;
    }),
    findById: jest.fn(async (id) => {
      const row = store.find((r) => r._id === id) || null;
      if (!row) return null;
      if (!row.save) row.save = jest.fn(async function () { return this; });
      return row;
    }),
    find: jest.fn(() => ({
      sort: () => ({
        limit: () => ({
          lean: async () => store,
        }),
      }),
    })),
    countDocuments: jest.fn(async () => store.length),
    __store: store,
  };
  return model;
});

jest.mock('../services/notificationService', () => ({
  createNotification: jest.fn().mockResolvedValue({}),
}));

const PtwWorkflow = require('../models/PtwWorkflow');
const {
  raiseWorkflow,
  advanceWorkflow,
  archiveWorkflow,
} = require('../services/ptwWorkflowService');

describe('ptwWorkflowService', () => {
  beforeEach(() => {
    PtwWorkflow.__store.length = 0;
    jest.clearAllMocks();
  });

  test('raises notification workflow', async () => {
    const doc = await raiseWorkflow({
      title: 'Pump vibration alarm',
      body: 'Check P-101',
      department: 'MMD',
      user: { name: 'Tech', email: 'tech@test.com', userId: '507f1f77bcf86cd799439011' },
    });
    expect(doc.status).toBe('notification');
    expect(doc.workflowId).toMatch(/^WF-/);
  });

  test('advances notification to work order', async () => {
    const doc = await raiseWorkflow({
      title: 'Leak reported',
      user: { name: 'Ops', email: 'ops@test.com' },
    });
    const advanced = await advanceWorkflow(doc._id, {
      status: 'work_order',
      workOrderNumber: '000303519529',
      user: { email: 'ops@test.com' },
    });
    expect(advanced.status).toBe('work_order');
    expect(advanced.workOrderNumber).toBe('000303519529');
  });

  test('archives cancelled workflow to history terminal state', async () => {
    const doc = await raiseWorkflow({
      title: 'Cancelled job',
      user: { name: 'Ops', email: 'ops@test.com' },
    });
    const archived = await archiveWorkflow(doc._id, {
      reason: 'permit_cancelled',
      terminalStatus: 'cancelled',
      user: { email: 'ops@test.com' },
    });
    expect(archived.status).toBe('cancelled');
    expect(archived.archivedAt).toBeTruthy();
  });
});
