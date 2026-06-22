const PTW = require('../models/ptw');
const AdminConfig = require('../models/AdminConfig');
const { PERMIT_TYPE_LABELS } = require('../constants/permitTypes');
const { findPtwPersonForUser, hasAuth } = require('../middleware/ptwAccess');
const { isSuperAdmin } = require('../middleware/superAdmin');
const { logAction } = require('../services/auditLogService');
const AUDIT_ACTIONS = require('../constants/auditActions');
const { nextPeSerialCode } = require('../utils/qippPeSerial');

function pushHistory(permit, entry) {
  if (!permit.history) permit.history = [];
  permit.history.push({ ...entry, at: new Date() });
}

function isReceiver(person) {
  return hasAuth(
    person,
    'permitReceiverStandard',
    'permitReceiverAccess',
    'permitReceiverLive',
    'permitReceiverRosh',
    'permitReceiverTest',
    'skilledPerson'
  );
}

function isSafetyController(person) {
  return hasAuth(
    person,
    'safetyCoordinator',
    'safetyControllerA',
    'safetyControllerB',
    'safetyControllerC'
  );
}

exports.getMyAccess = async (req, res) => {
  try {
    if (req.user?.role === 'admin' || req.user?.accessRole === 'admin') {
      return res.json({
        authorized: true,
        isAdmin: true,
        authorizations: ['admin'],
        person: { name: req.user.name },
        canReceive: true,
        canApproveJha: true,
        canIssue: true,
      });
    }
    const person = await findPtwPersonForUser(req.user);
    if (!person) {
      return res.json({ authorized: false, authorizations: [] });
    }
    return res.json({
      authorized: true,
      authorizations: person.authorizations || [],
      person: {
        name: person.name,
        designation: person.designation,
        empNo: person.empNo || person.empId,
      },
      canReceive: isReceiver(person),
      canApproveJha: isSafetyController(person),
      canIssue: hasAuth(person, 'permitIssuer'),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getAllPermits = async (req, res) => {
  try {
    const permits = await PTW.find().sort({ createdAt: -1 });
    res.json(permits);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createPermit = async (req, res) => {
  try {
    const person = req.ptwPerson;
    if (req.user?.role !== 'admin' && !isReceiver(person)) {
      return res.status(403).json({
        message: 'Only permit receivers (or skilled persons) can register a new permit / work order.',
      });
    }

    const {
      type,
      location,
      description,
      workOrderNumber,
      contractor,
      validFrom,
      validTo,
      initiateJha,
    } = req.body || {};

    if (!type || !PERMIT_TYPE_LABELS.includes(type)) {
      return res.status(400).json({ message: 'Invalid permit type.' });
    }
    if (!location?.trim() || !description?.trim()) {
      return res.status(400).json({ message: 'Location and description are required.' });
    }

    const usePeSerial = req.body?.usePeSerial === true;
    let permitId = workOrderNumber?.trim() || '';
    if (!permitId && usePeSerial) {
      permitId = await nextPeSerialCode();
    }
    if (!permitId) {
      permitId = `PTW-${Date.now().toString().slice(-6)}`;
    }

    const permit = new PTW({
      permitId,
      type,
      status: 'ready_to_prepare',
      location: location.trim(),
      description: description.trim(),
      workOrderNumber: workOrderNumber?.trim() || '',
      contractor: contractor?.trim() || '',
      validFrom: validFrom ? new Date(validFrom) : new Date(),
      validTo: validTo
        ? new Date(validTo)
        : new Date(Date.now() + 8 * 60 * 60 * 1000),
      createdBy: req.user?.name || 'Unknown',
      createdByEmail: req.user?.email || '',
      jhaStatus: initiateJha === false ? 'not_started' : 'submitted',
      jhaSubmittedAt: initiateJha === false ? undefined : new Date(),
      permitReceivers: [],
    });

    pushHistory(permit, {
      by: req.user?.name,
      action: 'created',
      toStatus: 'ready_to_prepare',
      note: initiateJha === false ? 'Work order registered' : 'JHA initiated — ready to prepare',
    });

    const saved = await permit.save();
    await logAction({
      actor: req.user,
      action: AUDIT_ACTIONS.PTW_PERMIT_CREATED,
      targetType: 'ptw_permit',
      targetId: saved._id?.toString(),
      targetName: saved.permitId,
      after: saved.toObject ? saved.toObject() : saved,
      req,
    });
    res.status(201).json(saved);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.updatePermitStatus = async (req, res) => {
  try {
    const person = req.ptwPerson;
    const isAdmin = req.user?.role === 'admin';
    const permit = await PTW.findById(req.params.id);
    const before = permit ? (permit.toObject ? permit.toObject() : permit) : null;
    if (!permit) return res.status(404).json({ message: 'Permit not found' });

    const { action, permitReceivers, jhaNotes, ...rest } = req.body || {};

    if (action === 'submit_jha') {
      if (!isAdmin && !isReceiver(person)) {
        return res.status(403).json({ message: 'Not allowed to submit JHA.' });
      }
      permit.jhaStatus = 'submitted';
      permit.jhaSubmittedAt = new Date();
      permit.status = 'ready_to_prepare';
      pushHistory(permit, {
        by: req.user?.name,
        action: 'jha_submitted',
        toStatus: 'ready_to_prepare',
        note: jhaNotes || 'JHA submitted',
      });
    } else if (action === 'approve_jha') {
      if (!isAdmin && !isSafetyController(person)) {
        return res.status(403).json({ message: 'Only a Safety Controller can approve JHA.' });
      }
      if (permit.jhaStatus !== 'submitted' && permit.jhaStatus !== 'not_started') {
        return res.status(400).json({ message: 'JHA is not awaiting approval.' });
      }
      permit.jhaStatus = 'approved';
      permit.jhaApprovedAt = new Date();
      permit.jhaApprovedBy = req.user?.name || '';
      permit.status = 'prepared';
      pushHistory(permit, {
        by: req.user?.name,
        action: 'jha_approved',
        fromStatus: permit.status,
        toStatus: 'prepared',
        note: jhaNotes || 'JHA approved',
      });
    } else if (action === 'issue') {
      if (!isAdmin && !hasAuth(person, 'permitIssuer')) {
        return res.status(403).json({ message: 'Only a Permit Issuer can issue permits.' });
      }
      if (permit.status !== 'prepared') {
        return res.status(400).json({
          message: 'Permit must be in Prepared status before it can be Issued.',
        });
      }
      if (permit.jhaStatus !== 'approved') {
        return res.status(400).json({ message: 'JHA must be approved before issuing.' });
      }
      const receivers = Array.isArray(permitReceivers)
        ? permitReceivers.filter(Boolean)
        : [];
      if (!receivers.length) {
        return res.status(400).json({ message: 'Select at least one permit receiver.' });
      }
      permit.permitReceivers = receivers;
      permit.issuedBy = req.user?.name || '';
      permit.issuedByEmail = req.user?.email || '';
      permit.status = 'issued';
      pushHistory(permit, {
        by: req.user?.name,
        action: 'issued',
        fromStatus: 'prepared',
        toStatus: 'issued',
        note: `Receivers: ${receivers.join(', ')}`,
      });
    } else if (action === 'close' || action === 'cancel' || action === 'suspend' || action === 'surrender') {
      if (!isAdmin && !hasAuth(person, 'permitIssuer') && !isSafetyController(person)) {
        return res.status(403).json({ message: 'Not allowed to change permit status.' });
      }
      const map = {
        close: 'closed',
        cancel: 'cancelled',
        suspend: 'suspended',
        surrender: 'surrendered',
      };
      const next = map[action];
      if (!next) return res.status(400).json({ message: 'Unknown action.' });
      const prev = permit.status;
      permit.status = next;
      pushHistory(permit, {
        by: req.user?.name,
        action,
        fromStatus: prev,
        toStatus: next,
        note: jhaNotes || '',
      });
    } else {
      if (!isSuperAdmin(req)) {
        return res.status(403).json({
          message: 'Only admin@acwaops.com may edit permit fields.',
        });
      }
      const allowed = ['location', 'description', 'contractor', 'validFrom', 'validTo', 'workOrderNumber'];
      for (const key of allowed) {
        if (rest[key] !== undefined) permit[key] = rest[key];
      }
    }

    await permit.save();
    await logAction({
      actor: req.user,
      action: AUDIT_ACTIONS.PTW_PERMIT_UPDATED,
      targetType: 'ptw_permit',
      targetId: permit._id?.toString(),
      targetName: permit.permitId,
      before,
      after: permit.toObject ? permit.toObject() : permit,
      req,
    });
    res.json(permit);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deletePermit = async (req, res) => {
  try {
    if (req.user?.role !== 'admin' && !hasAuth(req.ptwPerson, 'permitIssuer')) {
      return res.status(403).json({ message: 'Not allowed to delete permits.' });
    }
    const permit = await PTW.findByIdAndDelete(req.params.id);
    if (!permit) return res.status(404).json({ message: 'Permit not found' });
    await logAction({
      actor: req.user,
      action: AUDIT_ACTIONS.PTW_PERMIT_DELETED,
      targetType: 'ptw_permit',
      targetId: permit._id?.toString(),
      targetName: permit.permitId,
      before: permit.toObject ? permit.toObject() : permit,
      req,
    });
    res.json({ message: 'Permit deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.patchPermitFields = async (req, res) => {
  try {
    const permit = await PTW.findById(req.params.id);
    if (!permit) return res.status(404).json({ message: 'Permit not found' });

    const body = req.body || {};
    const editable = [
      'permitId',
      'type',
      'status',
      'location',
      'description',
      'workOrderNumber',
      'contractor',
      'createdBy',
      'jhaNotes',
    ];

    for (const key of editable) {
      if (body[key] !== undefined) permit[key] = body[key];
    }
    if (body.validFrom !== undefined) permit.validFrom = body.validFrom ? new Date(body.validFrom) : null;
    if (body.validTo !== undefined) permit.validTo = body.validTo ? new Date(body.validTo) : null;

    if (permit.type && !PERMIT_TYPE_LABELS.includes(permit.type)) {
      return res.status(400).json({ message: 'Invalid permit type.' });
    }

    pushHistory(permit, {
      by: req.user?.name,
      action: 'inline_edit',
      note: 'Permit fields updated by super admin',
    });

    await permit.save();
    res.json(permit);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.patchAuthorizationPerson = async (req, res) => {
  try {
    const config = (await AdminConfig.findOne()) || new AdminConfig();
    const person = config.ptwPersonnel.id(req.params.personId);
    if (!person) return res.status(404).json({ message: 'Authorization person not found.' });
    Object.assign(person, req.body || {});
    await config.save();
    await logAction({
      actor: req.user,
      action: AUDIT_ACTIONS.PTW_AUTH_PERSON_UPDATED,
      targetType: 'ptw_auth_person',
      targetId: person._id?.toString(),
      targetName: person.name,
      after: person.toObject ? person.toObject() : person,
      req,
    });
    res.json(person);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.createAuthorizationPerson = async (req, res) => {
  try {
    const body = req.body || {};
    if (!String(body.name || '').trim()) {
      return res.status(400).json({ message: 'Name is required.' });
    }
    const config = (await AdminConfig.findOne()) || new AdminConfig();
    config.ptwPersonnel.push(body);
    await config.save();
    const added = config.ptwPersonnel[config.ptwPersonnel.length - 1];
    await logAction({
      actor: req.user,
      action: AUDIT_ACTIONS.PTW_AUTH_PERSON_ADDED,
      targetType: 'ptw_auth_person',
      targetId: added?._id?.toString(),
      targetName: added?.name,
      after: added,
      req,
    });
    res.status(201).json(added);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deleteAuthorizationPerson = async (req, res) => {
  try {
    const config = await AdminConfig.findOne();
    if (!config) return res.status(404).json({ message: 'Config not found.' });
    const removed = config.ptwPersonnel.find((p) => p._id.toString() === String(req.params.personId));
    config.ptwPersonnel = config.ptwPersonnel.filter(
      (p) => p._id.toString() !== String(req.params.personId)
    );
    await config.save();
    await logAction({
      actor: req.user,
      action: AUDIT_ACTIONS.PTW_AUTH_PERSON_DELETED,
      targetType: 'ptw_auth_person',
      targetId: removed?._id?.toString(),
      targetName: removed?.name,
      before: removed,
      req,
    });
    res.json({ message: 'Authorization person removed.' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
