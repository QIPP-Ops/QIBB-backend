const AdminUser = require('../models/AdminUser');
const ShiftReport = require('../models/ShiftReport');
const ShiftReportAuditLog = require('../models/ShiftReportAuditLog');
const { logShiftReportEvent } = require('../services/shiftReportAuditService');
const { getEmployeeDutyStatus, fmtDate } = require('../services/onDutyService');

function isPortalAdmin(req) {
  return req.user?.role === 'admin' || req.user?.accessRole === 'admin';
}

function actorFromReq(req) {
  return {
    _id: req.user?.id,
    id: req.user?.id,
    email: req.user?.email,
    name: req.user?.name,
  };
}

async function loadEmployee(empId) {
  return AdminUser.findOne({ empId: String(empId).trim() })
    .select('-passwordHash')
    .lean();
}

async function assertOnDuty(employee, dateStr) {
  const duty = await getEmployeeDutyStatus(employee, dateStr);
  if (!duty.onDuty) {
    const err = new Error(
      duty.onLeave
        ? 'Shift report is only available while on duty (employee is on leave).'
        : 'Shift report is only available while on duty (off shift today).'
    );
    err.status = 403;
    throw err;
  }
  return duty;
}

exports.listShiftReports = async (req, res) => {
  try {
    const empId = String(req.query.empId || '').trim();
    const date = String(req.query.date || fmtDate()).trim();
    if (!empId) {
      return res.status(400).json({ message: 'empId query parameter is required.' });
    }

    const isAdmin = isPortalAdmin(req);
    if (!isAdmin && req.user?.empId !== empId) {
      return res.status(403).json({ message: 'You can only view your own shift reports.' });
    }

    const employee = await loadEmployee(empId);
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found.' });
    }

    const duty = await getEmployeeDutyStatus(employee, date);
    const reports = await ShiftReport.find({ empId, date }).sort({ shift: 1 }).lean();

    res.json({
      success: true,
      data: {
        reports,
        duty,
        canEdit: isAdmin || (req.user?.empId === empId && duty.onDuty),
      },
    });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

exports.createShiftReport = async (req, res) => {
  try {
    const {
      empId: bodyEmpId,
      date = fmtDate(),
      status = 'normal',
      handoverNotes = '',
      equipmentNotes = '',
      safetyNotes = '',
    } = req.body || {};

    const empId = String(bodyEmpId || req.user?.empId || '').trim();
    const isAdmin = isPortalAdmin(req);

    if (!empId) {
      return res.status(400).json({ message: 'empId is required.' });
    }
    if (!isAdmin && req.user?.empId !== empId) {
      return res.status(403).json({ message: 'You can only submit shift reports for yourself.' });
    }

    const employee = await loadEmployee(empId);
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found.' });
    }

    const duty = await assertOnDuty(employee, date);
    const shift = duty.shift;
    if (shift !== 'D' && shift !== 'N') {
      return res.status(403).json({ message: 'No active day/night shift for this date.' });
    }

    const existing = await ShiftReport.findOne({ empId, date, shift });
    if (existing) {
      return res.status(409).json({
        message: 'A shift report already exists for this shift. Use update instead.',
        id: existing._id,
      });
    }

    const doc = await ShiftReport.create({
      empId,
      employeeName: employee.name,
      crew: employee.crew,
      date,
      shift,
      status,
      handoverNotes,
      equipmentNotes,
      safetyNotes,
      createdBy: req.user?.id,
      updatedBy: req.user?.id,
    });

    await logShiftReportEvent({
      action: 'SHIFT_REPORT_CREATED',
      actor: actorFromReq(req),
      target: employee,
      shiftReportId: doc._id,
      summary: `Shift report created for ${employee.name} (${empId}) — ${date} ${shift}`,
      metadata: { date, shift, status },
    });

    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

exports.updateShiftReport = async (req, res) => {
  try {
    const doc = await ShiftReport.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({ message: 'Shift report not found.' });
    }

    const employee = await loadEmployee(doc.empId);
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found.' });
    }

    const isAdmin = isPortalAdmin(req);
    const isOwner = req.user?.empId === doc.empId;

    if (!isAdmin && !isOwner) {
      return res.status(403).json({ message: 'You cannot edit this shift report.' });
    }

    if (!isAdmin) {
      await assertOnDuty(employee, doc.date);
    }

    const allowed = ['status', 'handoverNotes', 'equipmentNotes', 'safetyNotes'];
    const patch = {};
    allowed.forEach((key) => {
      if (req.body && Object.prototype.hasOwnProperty.call(req.body, key)) {
        patch[key] = req.body[key];
      }
    });

    Object.assign(doc, patch);
    doc.updatedBy = req.user?.id;
    await doc.save();

    await logShiftReportEvent({
      action: 'SHIFT_REPORT_UPDATED',
      actor: actorFromReq(req),
      target: employee,
      shiftReportId: doc._id,
      summary: `Shift report updated for ${employee.name} (${doc.empId}) — ${doc.date} ${doc.shift}`,
      metadata: { patch, adminEdit: isAdmin },
    });

    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message });
  }
};

exports.getShiftReportAudit = async (req, res) => {
  try {
    const report = await ShiftReport.findById(req.params.id).lean();
    if (!report) {
      return res.status(404).json({ message: 'Shift report not found.' });
    }

    const logs = await ShiftReportAuditLog.find({ shiftReportId: report._id })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    res.json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
