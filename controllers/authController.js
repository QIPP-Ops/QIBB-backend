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
  getFrontendBaseUrl,
} = require('../services/emailService');

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

const AdminConfig = require('../models/AdminConfig');
const { logRosterEvent } = require('../services/rosterAuditService');
const { userCanAccessOpsTools } = require('../services/shiftScheduleService');

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
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Email is required.' });

  try {
    const user = await AdminUser.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found.' });
    if (user.isEmailVerified) return res.json({ message: 'Email already verified.' });

    const otp          = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash      = await bcrypt.hash(otp, 10);
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);

    user.otpHash      = otpHash;
    user.otpExpiresAt = otpExpiresAt;
    await user.save();

    await sendOtpEmail(email, user.name, otp);
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
    const user = await AdminUser.findOne({ email });
    if (!user) return res.status(401).json({ message: 'Invalid credentials.' });

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

    const token = jwt.sign({
      id:    user._id,
      email: user.email,
      role:  user.accessRole,
      name:  user.name,
      empId: user.empId,
      crew:  user.crew,
    }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({ token, role: user.accessRole });
  } catch (error) {
    res.status(500).json({ message: 'Login failed.', error: error.message });
  }
};

// ─── Forgot Password ─────────────────────────────────────────────────────────

exports.forgotPassword = async (req, res) => {
  const email = normalizeEmail(req.body.email);
  if (!email) return res.status(400).json({ message: 'Email is required.' });

  if (!isEmailConfigured()) {
    return res.status(503).json({
      message: 'Password reset email is not configured on the server. Contact your administrator.',
      code: 'SMTP_NOT_CONFIGURED',
    });
  }

  try {
    const user = await AdminUser.findOne({ email });
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
      console.error('Reset email failed:', emailErr.message);
      user.resetToken = null;
      user.resetTokenExpires = null;
      await user.save();
      return res.status(503).json({
        message: 'Could not send reset email. Check that SMTP settings are correct, or contact your administrator.',
        code: 'RESET_EMAIL_FAILED',
      });
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
  const { id } = req.params;
  try {
    const user = await AdminUser.findOne({ _id: id });
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const tempPassword = crypto.randomBytes(5).toString('hex');
    user.passwordHash = await bcrypt.hash(tempPassword, 10);
    await user.save();

    try {
      await sendTempPasswordEmail(user.email, user.name, tempPassword);
    } catch (emailErr) {
      console.error('Temp password email failed:', emailErr.message);
    }

    res.json({ message: `Password reset. Temporary password sent to ${user.email}.` });
  } catch (error) {
    res.status(500).json({ message: 'Admin reset failed.', error: error.message });
  }
};

// ─── Verify Token ─────────────────────────────────────────────────────────────

exports.verify = async (req, res) => {
  try {
    const user = await AdminUser.findById(req.user.id).select('-passwordHash');
    if (!user) return res.status(404).json({ message: 'User not found.' });
    res.json({
      ok: true,
      user: {
        id:          user._id,
        email:       user.email,
        role:        user.accessRole,
        jobRole:     user.role,
        name:        user.name,
        empId:       user.empId,
        crew:        user.crew,
        color:       user.color,
        canOpsLead:  userCanAccessOpsTools(user),
      },
    });
  } catch (err) {
    res.status(500).json({ message: 'Verification failed.', error: err.message });
  }
};
