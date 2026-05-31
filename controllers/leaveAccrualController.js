const AdminUser = require('../models/AdminUser');
const { logRosterEvent } = require('../services/rosterAuditService');
const { filterProtectedAccounts } = require('../utils/protectedAccounts');

async function loadActor(req) {
  if (!req.user?.id) return null;
  return AdminUser.findById(req.user.id).select('-passwordHash');
}

exports.listAccrualRates = async (req, res) => {
  try {
    const rows = filterProtectedAccounts(
      await AdminUser.find({ isApproved: true })
        .select(
          'empId name crew role annualLeaveBalance bankLeaveBalance annualLeaveAccrualRate bankLeaveAccrualRate annualLeaveCap bankLeaveCap joiningDate lastLeaveAccrualDate'
        )
        .sort({ crew: 1, role: 1, name: 1 })
        .lean()
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.patchAccrualRates = async (req, res) => {
  try {
    const { empId } = req.params;
    const user = await AdminUser.findOne({ empId });
    if (!user) return res.status(404).json({ message: 'Personnel not found' });

    const {
      annualLeaveAccrualRate,
      bankLeaveAccrualRate,
      annualLeaveBalance,
      bankLeaveBalance,
      annualLeaveCap,
      bankLeaveCap,
    } = req.body;

    const actor = await loadActor(req);

    if (annualLeaveAccrualRate !== undefined) {
      user.annualLeaveAccrualRate = Number(annualLeaveAccrualRate) || 0;
    }
    if (bankLeaveAccrualRate !== undefined) {
      user.bankLeaveAccrualRate = Number(bankLeaveAccrualRate) || 0;
    }
    if (annualLeaveBalance !== undefined) {
      user.annualLeaveBalance = Number(annualLeaveBalance) || 0;
    }
    if (bankLeaveBalance !== undefined) {
      user.bankLeaveBalance = Number(bankLeaveBalance) || 0;
    }
    if (annualLeaveCap !== undefined) {
      user.annualLeaveCap = annualLeaveCap === null || annualLeaveCap === '' ? null : Number(annualLeaveCap);
    }
    if (bankLeaveCap !== undefined) {
      user.bankLeaveCap = bankLeaveCap === null || bankLeaveCap === '' ? null : Number(bankLeaveCap);
    }

    await user.save();

    await logRosterEvent({
      action: 'LEAVE_ACCRUAL_UPDATED',
      actor,
      target: user,
      summary: `Leave accrual settings updated for ${user.name} (${empId})`,
      metadata: {
        annualLeaveAccrualRate: user.annualLeaveAccrualRate,
        bankLeaveAccrualRate: user.bankLeaveAccrualRate,
        annualLeaveBalance: user.annualLeaveBalance,
        bankLeaveBalance: user.bankLeaveBalance,
      },
    });

    res.json({ success: true, data: user });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.bulkPatchAccrualRates = async (req, res) => {
  try {
    const { empIds, annualLeaveAccrualRate, bankLeaveAccrualRate } = req.body;
    if (!Array.isArray(empIds) || !empIds.length) {
      return res.status(400).json({ message: 'empIds array is required.' });
    }
    if (annualLeaveAccrualRate === undefined && bankLeaveAccrualRate === undefined) {
      return res.status(400).json({ message: 'At least one accrual rate is required.' });
    }

    const actor = await loadActor(req);
    const update = {};
    if (annualLeaveAccrualRate !== undefined) {
      update.annualLeaveAccrualRate = Number(annualLeaveAccrualRate) || 0;
    }
    if (bankLeaveAccrualRate !== undefined) {
      update.bankLeaveAccrualRate = Number(bankLeaveAccrualRate) || 0;
    }

    const result = await AdminUser.updateMany(
      { empId: { $in: empIds.map(String) } },
      { $set: update }
    );

    await logRosterEvent({
      action: 'LEAVE_ACCRUAL_BULK',
      actor,
      target: null,
      summary: `Bulk leave accrual rates applied to ${empIds.length} employee(s)`,
      metadata: { empIds, ...update },
    });

    res.json({ success: true, modified: result.modifiedCount });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};
