const mongoose  = require('mongoose');
const AdminUser = require('../models/AdminUser');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const crypto    = require('crypto');
const {
  sendOtpEmail,
  sendResetEmail,
  sendTempPasswordEmail,
  isEmailConfigured,
} = require('../services/emailService');
const { getFrontendBaseUrl } = require('../config/frontendUrl');
const { SUPER_ADMIN_EMAIL } = require('../config/superAdmin');
const { buildJwtPayload, JWT_EXPIRES_IN } = require('../utils/jwtAuth');
const { logAction } = require('../services/auditLogService');
const AUDIT_ACTIONS = require('../constants/auditActions');

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

async function findUserByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  let user = await AdminUser.findOne({ email: normalized });
  if (user) return user;
  return AdminUser.findOne({
    email: { $regex: new RegExp(`^${normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
  });
}

const AdminConfig = require('../models/AdminConfig');
const { logRosterEvent } = require('../services/rosterAuditService');

const AUTO_APPROVED_DOMAINS = ['acwapower.com', 'nomac.com', 'acwaops.com'];

function getEmailDomain(email) {
  return email.split('@')[1]?.toLowerCase() || '';
}

// ─── Register options (public) ───────────────────────────────────────────────

exports.getRegisterOptions = async (_req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      const defaults = new AdminConfig();
      return res.json({
        availableCrews: defaults.availableCrews,
        availableRoles: defaults.availableRoles,
      });
    }

    let config = await AdminConfig.findOne();
    if (!config) {
      config = new AdminConfig();
      await config.save();
    }
    res.json({
      availableCrews: config.availableCrews,
      availableRoles: config.availableRoles,
    });
  } catch (error) {
    res.status(500).json({ message: 'Unable to load registration options.', error: error.message });
  }
};

// ─── Register ────────────────────────────────────────────────────────────────

exports.register = async (req, res) => {
  const { email, password, name, empId, crew, role, color } = req.body;

  if (!email || !password || !name || !empId || !crew || !role) {
    return res.status(400).json({ message: 'All personnel fields are required.' });
  }

  try {
    const existing = await AdminUser.findOne({ $or: [{ email }, { empId }] });
    if (existing) {
      if (existing.email === email) return res.status(409).json({ message: 'Email already registered.' });
      if (existing.empId === empId) return res.status(409).json({ message: 'Employee ID already registered.' });
    }

    const domain       = getEmailDomain(email);
    const autoApproved = AUTO_APPROVED_DOMAINS.includes(domain);

    const otp          = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash      = await bcrypt.hash(otp, 10);
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const passwordHash = await bcrypt.hash(password, 10);

    const user = new AdminUser({
      email,
      passwordHash,
      name,
      empId,
      crew,
      role,
      color:           color || 'crew-grey',
      accessRole:      'viewer',
      isApproved:      autoApproved,
      isEmailVerified: false,
      otpHash,
      otpExpiresAt,
      leaves:          [],
    });

    await user.save();
    await logAction({
      actor: req.user,
      action: AUDIT_ACTIONS.PASSWORD_RESET,
      targetType: 'employee',
      targetId: user._id?.toString(),
      targetName: user.name,
      after: { email: user.email },
      req,
    });

    await logRosterEvent({
      action: 'USER_REGISTERED',
      actor: null,
      target: user,
      summary: `${name} registered (${email}) — crew ${crew}, empId ${empId}`,
      metadata: { autoApproved, email },
    });

    try {
      await sendOtpEmail(email, name, otp);
    } catch (emailErr) {
      console.error('OTP email failed:', emailErr.message);
      await AdminUser.deleteOne({ _id: user._id });
      return res.status(503).json({
        message: 'Could not send verification email. Check SMTP settings and try again.',
        code: 'OTP_EMAIL_FAILED',
      });
    }

    res.status(201).json({
      message: autoApproved
        ? 'Registered successfully. Check your email for the OTP to verify your account.'
        : 'Registered. Verify your email, then await admin approval.',
      role:        user.accessRole,
      autoApproved,
      otpSent:     true,
    });
  } catch (error) {
    res.status(500).json({ message: 'Error registering personnel.', error: error.message });
  }
};

// ─── Verify OTP ──────────────────────────────────────────────────────────────

exports.verifyOtp = async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ message: 'Email and OTP are required.' });

  try {
    const user = await AdminUser.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found.' });
    if (user.isEmailVerified) return res.json({ message: 'Email already verified.' });
    if (!user.otpHash || !user.otpExpiresAt) {
      return res.status(400).json({ message: 'No OTP found. Please register again.' });
    }
    if (new Date() > user.otpExpiresAt) {
      return res.status(400).json({ message: 'OTP has expired. Request a new one.' });
    }

    const valid = await bcrypt.compare(otp, user.otpHash);
    if (!valid) return res.status(401).json({ message: 'Invalid OTP.' });

    user.isEmailVerified = true;
    user.otpHash         = null;
    user.otpExpiresAt    = null;
    await user.save();

    res.json({ message: 'Email verified successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'OTP verification failed.', error: error.message });
  }
};

// ─── Resend OTP ──────────────────────────────────────────────────────────────

exports.resendOtp = async (req, res) => {
  const email = normalizeEmail(req.body.email);
  if (!email) return res.status(400).json({ message: 'Email is required.' });

  if (!isEmailConfigured()) {
    return res.status(503).json({
      message: 'Email is not configured on the server. Contact your administrator.',
      code: 'SMTP_NOT_CONFIGURED',
    });
  }

  try {
    const user = await findUserByEmail(email);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    if (user.isEmailVerified) return res.json({ message: 'Email already verified.' });

    const otp          = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash      = await bcrypt.hash(otp, 10);
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    user.otpHash      = otpHash;
    user.otpExpiresAt = otpExpiresAt;
    await user.save();

    try {
      await sendOtpEmail(user.email, user.name, otp);
    } catch (emailErr) {
      console.error('OTP resend failed:', emailErr.message);
      return res.status(503).json({
        message: 'Could not send OTP email. Check SMTP settings on the API server.',
        code: 'OTP_EMAIL_FAILED',
      });
    }
    res.json({ message: 'OTP resent successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to resend OTP.', error: error.message });
  }
};

// ─── Login ───────────────────────────────────────────────────────────────────

exports.login = async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const { password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }
  try {
    const user = await findUserByEmail(email);
    if (!user) return res.status(401).json({ message: 'Invalid credentials.' });

    if (!user.passwordHash) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ message: 'Invalid credentials.' });

    if (!user.isEmailVerified) {
      return res.status(403).json({
        message: 'Please verify your email before logging in.',
        code: 'EMAIL_NOT_VERIFIED',
      });
    }
    if (!user.isApproved) {
      return res.status(403).json({
        message: 'Your account is pending admin approval.',
        code: 'PENDING_APPROVAL',
      });
    }
    if (user.isActive === false) {
      return res.status(403).json({
        message: 'Your account access has been revoked. Contact an administrator.',
        code: 'ACCESS_REVOKED',
      });
    }

    const payload = buildJwtPayload(user);
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    res.json({
      token,
      role: payload.role,
      user: {
        email: payload.email,
        role: payload.role,
        displayName: payload.displayName,
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Login failed.', error: error.message });
  }
};

// ─── Forgot Password ─────────────────────────────────────────────────────────

exports.forgotPassword = async (req, res) => {
  const email = normalizeEmail(req.body.email);
  if (!email) return res.status(400).json({ message: 'Email is required.' });

  if (!isEmailConfigured()) {
    return res.json({ message: 'If that email exists, a reset link has been sent.' });
  }

  try {
    const user = await findUserByEmail(email);
    if (!user) {
      return res.json({ message: 'If that email exists, a reset link has been sent.' });
    }

    const token             = crypto.randomBytes(32).toString('hex');
    const resetToken        = crypto.createHash('sha256').update(token).digest('hex');
    const resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000);

    user.resetToken        = resetToken;
    user.resetTokenExpires = resetTokenExpires;
    await user.save();

    const resetUrl = `${getFrontendBaseUrl()}/reset-password?token=${token}&email=${encodeURIComponent(email)}`;

    try {
      await sendResetEmail(email, user.name, resetUrl);
    } catch (emailErr) {
      console.error('Reset email failed:', emailErr.message, emailErr.code || '');
      user.resetToken = null;
      user.resetTokenExpires = null;
      await user.save();
      return res.json({ message: 'If that email exists, a reset link has been sent.' });
    }

    res.json({ message: 'If that email exists, a reset link has been sent.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to process request.', error: error.message });
  }
};

// ─── Reset Password (user via token) ─────────────────────────────────────────

exports.resetPassword = async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const { token, newPassword } = req.body;
  if (!email || !token || !newPassword) {
    return res.status(400).json({ message: 'All fields required.' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters.' });
  }

  try {
    const resetToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await AdminUser.findOne({
      email,
      resetToken,
      resetTokenExpires: { $gt: new Date() },
    });

    if (!user) return res.status(400).json({ message: 'Invalid or expired reset link.' });

    user.passwordHash     = await bcrypt.hash(newPassword, 10);
    user.resetToken       = null;
    user.resetTokenExpires = null;
    await user.save();

    res.json({ message: 'Password reset successfully. You can now log in.' });
  } catch (error) {
    res.status(500).json({ message: 'Password reset failed.', error: error.message });
  }
};

// ─── Admin Force-Reset Password ───────────────────────────────────────────────

exports.adminResetPassword = async (req, res) => {
  const userId = req.params.userId || req.params.id;
  try {
    const user = await AdminUser.findOne({ _id: userId });
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const { isPlaceholderEmail } = require('../utils/placeholderEmail');
    if (isPlaceholderEmail(user.email)) {
      return res.status(400).json({
        message:
          'This member has no real email address. The password reset cannot be delivered. Please update their email first.',
        code: 'PLACEHOLDER_EMAIL',
      });
    }

    const tempPassword = crypto.randomBytes(5).toString('hex');
    user.passwordHash = await bcrypt.hash(tempPassword, 10);
    user.resetToken = null;
    user.resetTokenExpires = null;
    await user.save();

    let emailSent = false;
    if (isEmailConfigured()) {
      try {
        await sendTempPasswordEmail(user.email, user.name, tempPassword);
        emailSent = true;
      } catch (emailErr) {
        console.error('Temp password email failed:', emailErr.message);
        return res.status(503).json({
          message: 'Could not send password reset email. Check SMTP settings and try again.',
          code: 'RESET_EMAIL_FAILED',
        });
      }
    } else {
      return res.status(503).json({
        message: 'Email is not configured on the server. Cannot send password reset.',
        code: 'SMTP_NOT_CONFIGURED',
      });
    }

    res.json({
      message: `Password reset sent to ${user.email}.`,
      emailSent: true,
      email: user.email,
    });
  } catch (error) {
    res.status(500).json({ message: 'Admin reset failed.', error: error.message });
  }
};

// ─── Admin Revoke / Restore Access ───────────────────────────────────────────

exports.adminRevokeAccess = async (req, res) => {
  const { userId } = req.params;
  try {
    const user = await AdminUser.findOne({ _id: userId });
    if (!user) return res.status(404).json({ message: 'User not found.' });

    if (normalizeEmail(user.email) === normalizeEmail(SUPER_ADMIN_EMAIL)) {
      return res.status(403).json({ message: 'The super administrator account cannot be revoked.' });
    }

    const beforeActive = user.isActive;
    user.isActive = user.isActive === false;
    await user.save();
    await logAction({
      actor: req.user,
      action: user.isActive ? AUDIT_ACTIONS.ACCESS_RESTORED : AUDIT_ACTIONS.ACCESS_REVOKED,
      targetType: 'employee',
      targetId: user._id?.toString(),
      targetName: user.name,
      before: { isActive: beforeActive },
      after: { isActive: user.isActive },
      req,
    });

    res.json({
      message: user.isActive ? 'Access restored.' : 'Access revoked.',
      isActive: user.isActive,
      userId: user._id,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update access.', error: error.message });
  }
};

// ─── Verify Token ─────────────────────────────────────────────────────────────

/** Authenticated user changes own password. */
exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Current and new password are required.' });
  }
  if (String(newPassword).length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters.' });
  }

  try {
    const userId = req.user?.userId || req.user?.id;
    const user = await AdminUser.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) return res.status(401).json({ message: 'Current password is incorrect.' });

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.resetToken = null;
    user.resetTokenExpires = null;
    await user.save();

    await logAction({
      actor: req.user,
      action: AUDIT_ACTIONS.PASSWORD_RESET,
      targetType: 'employee',
      targetId: user._id?.toString(),
      targetName: user.name,
      req,
    });

    res.json({ message: 'Password updated successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Password change failed.', error: error.message });
  }
};

/** Update own profile (avatar URL / base64). */
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    const user = await AdminUser.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const { profilePhotoUrl } = req.body;
    if (profilePhotoUrl !== undefined) {
      const url = String(profilePhotoUrl || '').trim();
      if (url.length > 500_000) {
        return res.status(400).json({ message: 'Profile photo is too large.' });
      }
      user.profilePhotoUrl = url;
    }

    await user.save();
    res.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        profilePhotoUrl: user.profilePhotoUrl,
      },
    });
  } catch (error) {
    res.status(500).json({ message: 'Profile update failed.', error: error.message });
  }
};

/** Stateless — identity from verified JWT; optional profile photo when DB is up. */
exports.verify = (req, res) => {
  const u = req.user;
  const mongoose = require('mongoose');
  const payload = {
    ok: true,
    user: {
      id: u.userId || u.id,
      email: u.email,
      role: u.role,
      accessRole: u.accessRole,
      displayName: u.displayName || u.name,
      name: u.displayName || u.name,
      empId: u.empId,
      crew: u.crew,
      canOpsLead: u.canOpsLead === true,
      profilePhotoUrl: '',
    },
  };

  if (mongoose.connection.readyState !== 1) {
    return res.json(payload);
  }

  const userId = u.userId || u.id;
  if (!userId) {
    return res.json(payload);
  }

  AdminUser.findById(userId).select('profilePhotoUrl').lean()
    .then((row) => {
      if (row?.profilePhotoUrl) payload.user.profilePhotoUrl = row.profilePhotoUrl;
      res.json(payload);
    })
    .catch(() => {
      res.json(payload);
    });
};
