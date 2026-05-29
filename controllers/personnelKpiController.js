const mongoose = require('mongoose');
const AdminUser = require('../models/AdminUser');
const { hasPortalAdminAccess } = require('../middleware/superAdmin');
const { isSupervisorRole } = require('../services/notificationService');
const kpiService = require('../services/kpiService');

function viewerId(req) {
  return String(req.user?.id || req.user?._id || '');
}

function canViewOtherMemberKpi(req, member) {
  if (!member) return false;
  const vid = viewerId(req);
  if (vid && vid === String(member._id)) return true;
  if (req.user?.empId && member.empId && req.user.empId === member.empId) return true;
  if (hasPortalAdminAccess(req)) return true;
  if (req.user?.canOpsLead) return true;
  if (req.user?.role === 'management' || req.user?.accessRole === 'management') return true;
  if (isSupervisorRole(req.user?.jobRole) && req.user?.crew === member.crew) {
    return true;
  }
  return false;
}

function redactMemberScores(entry) {
  return {
    memberId: entry.memberId,
    empId: entry.empId,
    name: entry.name,
    crew: entry.crew,
    role: entry.role,
  };
}

exports.getMemberKpi = async (req, res) => {
  try {
    const { memberId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(memberId)) {
      return res.status(400).json({ message: 'Invalid member id.' });
    }

    const member = await AdminUser.findById(memberId).select('_id empId crew role').lean();
    if (!member) return res.status(404).json({ message: 'Member not found.' });

    if (!canViewOtherMemberKpi(req, member)) {
      return res.status(403).json({ message: 'Not authorized to view this member KPI.' });
    }

    const data = await kpiService.getMemberKpiById(memberId);
    if (!data) return res.status(404).json({ message: 'Member not found.' });

    res.json({
      trainingScore: data.trainingScore,
      ptwScore: data.ptwScore,
      individualKPI: data.individualKPI,
      ptwStatus: data.ptwStatus,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getCrewKpi = async (req, res) => {
  try {
    const { crewId } = req.params;
    const result = await kpiService.getCrewKpi(crewId);
    const canViewAll = hasPortalAdminAccess(req) ||
      req.user?.canOpsLead ||
      req.user?.role === 'management' ||
      req.user?.accessRole === 'management' ||
      isSupervisorRole(req.user?.jobRole);

    const members = result.members.map((m) => {
      if (canViewAll || canViewOtherMemberKpi(req, { _id: m.memberId, empId: m.empId, crew: m.crew })) {
        return m;
      }
      return redactMemberScores(m);
    });

    res.json({ crewKPI: result.crewKPI, members });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getAllKpis = async (req, res) => {
  try {
    if (!hasPortalAdminAccess(req)) {
      return res.status(403).json({ message: 'Administrator access required.' });
    }
    const data = await kpiService.getAllCrewKpis();
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
