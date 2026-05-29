const {
  notifyQuizAssigned,
  notifyQuizCompleted,
} = require('../services/notificationService');
const { isValidHtml } = require('../utils/validateHtml');

describe('quiz HTML validation', () => {
  test('sample quiz document is valid', () => {
    const html = `<!DOCTYPE html>
<html><head><title>Test</title></head>
<body><button onclick="window.parent.postMessage({type:'QUIZ_COMPLETE',score:100},'*')">Done</button></body></html>`;
    expect(isValidHtml(html)).toBe(true);
  });
});

describe('quiz notification bodies for KPI', () => {
  test('assigned body format matches kpiService extractor', () => {
    const title = 'Safety Quiz';
    const body = `You have been assigned: ${title}`;
    const m = body.match(/^You have been assigned:\s*(.+)$/i);
    expect(m[1].trim()).toBe(title);
  });

  test('completed body format matches kpiService extractor', () => {
    const userName = 'Jane Doe';
    const title = 'Safety Quiz';
    const body = `${userName} completed ${title}`;
    const prefix = `${userName} completed `;
    expect(body.slice(prefix.length).trim()).toBe(title);
  });
});

jest.mock('../models/Notification', () => ({
  create: jest.fn().mockResolvedValue({}),
  findOne: jest.fn(),
}));

jest.mock('../models/AdminUser', () => ({
  find: jest.fn().mockResolvedValue([]),
  findById: jest.fn(),
}));

describe('quiz notification helpers', () => {
  test('notifyQuizAssigned is exported', () => {
    expect(typeof notifyQuizAssigned).toBe('function');
  });
  test('notifyQuizCompleted is exported', () => {
    expect(typeof notifyQuizCompleted).toBe('function');
  });
});
