const AttendanceRecord = require('../models/AttendanceRecord');
const AdminUser = require('../models/AdminUser');
const { logAction } = require('../services/auditLogService');
const AUDIT_ACTIONS = require('../constants/auditActions');
const {
  canLogAttendance,
  canViewAttendanceList,
  canEditAttendanceForEmployee,
  canDeleteAttendance,
} = require('../utils/attendancePermissions');
const { crewsMatch } = require('../services/actingCoverService');
const { isSuperAdminUser } = require('../middleware/superAdmin');

function actorFromReq(req) {
  return {
    id: req.user?.id || req.user?.userId,
    email: req.user?.email,
    name: req.user?.name || req.user?.displayName,
  };
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

async function loadEmployee(empId) {
  return AdminUser.findOne({ empId: String(empId).trim() })
    .select('empId name crew role')
    .lean();
}

function normalizeRecordBody(body) {
  const status = String(body.status || 'present').trim().toLowerCase();
  const validStatus = ['present', 'absent', 'partial'].includes(status) ? status : 'present';
  const isLate = Boolean(body.isLate);
  const isLeftEarly = Boolean(body.isLeftEarly);

  return {
    status: validStatus,
    isLate: validStatus !== 'absent' && isLate,
    lateMinutes: validStatus !== 'absent' && isLate ? Math.max(0, Number(body.lateMinutes) || 0) : 0,
    isLeftEarly: validStatus !== 'absent' && isLeftEarly,
    leftEarlyMinutes:
      validStatus !== 'absent' && isLeftEarly ? Math.max(0, Number(body.leftEarlyMinutes) || 0) : 0,
    remarks: String(body.remarks || '').trim(),
  };
}

function applyLoggedBy(doc, actor) {
  doc.loggedBy = String(actor.id || actor.email || '');
  doc.loggedByEmail = String(actor.email || '').trim().toLowerCase();
  doc.loggedAt = new Date();
}

exports.listAttendance = async (req, res) => {
  try {
    const startDate = String(req.query.startDate || req.query.date || todayStr()).trim();
    const endDate = String(req.query.endDate || req.query.date || startDate).trim();
    const crew = String(req.query.crew || '').trim();
    const empId = String(req.query.empId || '').trim();

    if (!canViewAttendanceList(req, { crew, empId })) {
      return res.status(403).json({ message: 'You are not allowed to view these attendance records.' });
    }

    const filter = {
      date: { $gte: startDate, $lte: endDate },
    };

    if (empId) {
      filter.empId = empId;
    } else if (crew) {
      if (!canViewAttendanceList(req, { crew })) {
        return res.status(403).json({ message: 'You may only view attendance for your own crew.' });
      }
      filter.crew = crew;
    } else if (canLogAttendance(req) && !isSuperAdminUser(req)) {
      const actorCrew = String(req.user?.crew || '').trim();
      if (!actorCrew) {
        return res.status(400).json({ message: 'crew query parameter is required.' });
      }
      filter.crew = actorCrew;
    } else if (!canLogAttendance(req)) {
      const actorEmpId = String(req.user?.empId || '').trim();
      if (!actorEmpId) {
        return res.status(400).json({ message: 'empId or crew query parameter is required.' });
      }
      filter.empId = actorEmpId;
    }

    const records = await AttendanceRecord.find(filter).sort({ date: -1, empId: 1 }).lean();
    res.json({ success: true, data: records });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Failed to list attendance.' });
  }
};

exports.upsertAttendance = async (req, res) => {
  try {
    if (!canLogAttendance(req)) {
      return res.status(403).json({ message: 'Only supervisors, shift in charge, or super admin may log attendance.' });
    }

    const empId = String(req.body.empId || '').trim();
    const date = String(req.body.date || todayStr()).trim();
    if (!empId) {
      return res.status(400).json({ message: 'empId is required.' });
    }

    const employee = await loadEmployee(empId);
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found.' });
    }

    if (!canEditAttendanceForEmployee(req, employee)) {
      return res.status(403).json({ message: 'You may only log attendance for employees in your crew.' });
    }

    const bodyCrew = String(req.body.crew || employee.crew || '').trim();
    if (bodyCrew && !crewsMatch(bodyCrew, employee.crew)) {
      return res.status(400).json({ message: 'Crew does not match employee roster crew.' });
    }

    const normalized = normalizeRecordBody(req.body);
    const actor = actorFromReq(req);
    const existing = await AttendanceRecord.findOne({ empId, date });

    let doc;
    if (existing) {
      const before = existing.toObject();
      Object.assign(existing, normalized, {
        employeeName: employee.name || '',
        crew: employee.crew || '',
      });
      applyLoggedBy(existing, actor);
      doc = await existing.save();
      await logAction({
        actor,
        action: AUDIT_ACTIONS.ATTENDANCE_UPDATED,
        targetType: 'attendance',
        targetId: doc._id,
        targetName: `${empId} ${date}`,
        before,
        after: doc.toObject(),
        req,
      });
    } else {
      doc = await AttendanceRecord.create({
        empId,
        date,
        employeeName: employee.name || '',
        crew: employee.crew || '',
        ...normalized,
        loggedBy: String(actor.id || actor.email || ''),
        loggedByEmail: String(actor.email || '').trim().toLowerCase(),
        loggedAt: new Date(),
      });
      await logAction({
        actor,
        action: AUDIT_ACTIONS.ATTENDANCE_RECORDED,
        targetType: 'attendance',
        targetId: doc._id,
        targetName: `${empId} ${date}`,
        before: null,
        after: doc.toObject(),
        req,
      });
    }

    res.status(existing ? 200 : 201).json({ success: true, data: doc });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: 'Attendance record already exists for this employee and date.' });
    }
    res.status(err.status || 500).json({ message: err.message || 'Failed to save attendance.' });
  }
};

exports.batchUpsertAttendance = async (req, res) => {
  try {
    if (!canLogAttendance(req)) {
      return res.status(403).json({ message: 'Only supervisors, shift in charge, or super admin may log attendance.' });
    }

    const date = String(req.body.date || todayStr()).trim();
    const records = Array.isArray(req.body.records) ? req.body.records : [];
    if (!records.length) {
      return res.status(400).json({ message: 'records array is required.' });
    }

    const actor = actorFromReq(req);
    const saved = [];
    const errors = [];

    for (const row of records) {
      const empId = String(row.empId || '').trim();
      if (!empId) {
        errors.push({ empId: '', message: 'empId is required.' });
        continue;
      }

      try {
        const employee = await loadEmployee(empId);
        if (!employee) {
          errors.push({ empId, message: 'Employee not found.' });
          continue;
        }
        if (!canEditAttendanceForEmployee(req, employee)) {
          errors.push({ empId, message: 'Not allowed for this crew.' });
          continue;
        }

        const normalized = normalizeRecordBody(row);
        const existing = await AttendanceRecord.findOne({ empId, date });
        let doc;

        if (existing) {
          const before = existing.toObject();
          Object.assign(existing, normalized, {
            employeeName: employee.name || '',
            crew: employee.crew || '',
          });
          applyLoggedBy(existing, actor);
          doc = await existing.save();
          await logAction({
            actor,
            action: AUDIT_ACTIONS.ATTENDANCE_UPDATED,
            targetType: 'attendance',
            targetId: doc._id,
            targetName: `${empId} ${date}`,
            before,
            after: doc.toObject(),
            req,
          });
        } else {
          doc = await AttendanceRecord.create({
            empId,
            date,
            employeeName: employee.name || '',
            crew: employee.crew || '',
            ...normalized,
            loggedBy: String(actor.id || actor.email || ''),
            loggedByEmail: String(actor.email || '').trim().toLowerCase(),
            loggedAt: new Date(),
          });
          await logAction({
            actor,
            action: AUDIT_ACTIONS.ATTENDANCE_RECORDED,
            targetType: 'attendance',
            targetId: doc._id,
            targetName: `${empId} ${date}`,
            before: null,
            after: doc.toObject(),
            req,
          });
        }
        saved.push(doc);
      } catch (rowErr) {
        errors.push({ empId, message: rowErr.message || 'Save failed.' });
      }
    }

    res.json({
      success: errors.length === 0,
      data: { saved, errors },
      message:
        errors.length === 0
          ? `Saved ${saved.length} attendance record(s).`
          : `Saved ${saved.length} record(s) with ${errors.length} error(s).`,
    });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Failed to batch save attendance.' });
  }
};

exports.patchAttendance = async (req, res) => {
  try {
    if (!canLogAttendance(req)) {
      return res.status(403).json({ message: 'Only supervisors, shift in charge, or super admin may update attendance.' });
    }

    const id = String(req.params.id || '').trim();
    const existing = await AttendanceRecord.findById(id);
    if (!existing) {
      return res.status(404).json({ message: 'Attendance record not found.' });
    }

    const employee = await loadEmployee(existing.empId);
    if (!canEditAttendanceForEmployee(req, employee)) {
      return res.status(403).json({ message: 'You may only update attendance for employees in your crew.' });
    }

    const before = existing.toObject();
    const normalized = normalizeRecordBody({ ...existing.toObject(), ...req.body });
    Object.assign(existing, normalized);
    if (employee) {
      existing.employeeName = employee.name || existing.employeeName;
      existing.crew = employee.crew || existing.crew;
    }
    applyLoggedBy(existing, actorFromReq(req));
    const doc = await existing.save();

    await logAction({
      actor: actorFromReq(req),
      action: AUDIT_ACTIONS.ATTENDANCE_UPDATED,
      targetType: 'attendance',
      targetId: doc._id,
      targetName: `${doc.empId} ${doc.date}`,
      before,
      after: doc.toObject(),
      req,
    });

    res.json({ success: true, data: doc });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Failed to update attendance.' });
  }
};

exports.deleteAttendance = async (req, res) => {
  try {
    if (!canDeleteAttendance(req)) {
      return res.status(403).json({ message: 'Only super admin may delete attendance records.' });
    }

    const id = String(req.params.id || '').trim();
    const existing = await AttendanceRecord.findById(id);
    if (!existing) {
      return res.status(404).json({ message: 'Attendance record not found.' });
    }

    const before = existing.toObject();
    await existing.deleteOne();

    await logAction({
      actor: actorFromReq(req),
      action: AUDIT_ACTIONS.ATTENDANCE_DELETED,
      targetType: 'attendance',
      targetId: id,
      targetName: `${before.empId} ${before.date}`,
      before,
      after: null,
      req,
    });

    res.json({ success: true, message: 'Attendance record deleted.' });
  } catch (err) {
    res.status(err.status || 500).json({ message: err.message || 'Failed to delete attendance.' });
  }
};
