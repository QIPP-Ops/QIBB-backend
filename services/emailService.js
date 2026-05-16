const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host:   'smtp.office365.com',
  port:   587,
  secure: false, // STARTTLS
  auth: {
    user: process.env.EMAIL_USER, // admin@acwaops.com
    pass: process.env.EMAIL_PASS, // your Outlook app password
  },
  tls: {
    ciphers: 'SSLv3',
    rejectUnauthorized: false,
  }
});

const FROM = `"ACWA Ops System" <${process.env.EMAIL_USER}>`;

// ─── Shared HTML wrapper ─────────────────────────────────────────────────────
function emailTemplate(title, bodyHtml) {
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <style>
      body { margin:0; padding:0; background:#f4f4f8; font-family:'Segoe UI',Arial,sans-serif; }
      .wrapper { max-width:520px; margin:40px auto; background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.08); }
      .header { background:#2E2044; padding:32px 40px; text-align:center; }
      .header img { height:36px; margin-bottom:12px; }
      .header h1 { color:#D2F050; font-size:13px; font-weight:800; letter-spacing:0.2em; text-transform:uppercase; margin:0; }
      .body { padding:40px; color:#2E2044; }
      .body h2 { font-size:22px; font-weight:800; margin:0 0 8px; }
      .body p { font-size:15px; line-height:1.6; color:#555; margin:0 0 16px; }
      .otp-box { background:#f4f4f8; border-radius:12px; padding:20px; text-align:center; margin:24px 0; }
      .otp-box span { font-size:40px; font-weight:900; letter-spacing:0.3em; color:#9273DA; }
      .btn { display:inline-block; background:#9273DA; color:#fff !important; text-decoration:none; font-weight:700; font-size:15px; padding:14px 32px; border-radius:10px; margin:16px 0; }
      .footer { background:#f9f7fc; padding:20px 40px; text-align:center; font-size:12px; color:#aaa; border-top:1px solid #eee; }
    </style>
  </head>
  <body>
    <div class="wrapper">
      <div class="header">
        <img src="https://www.acwapower.com/images/favicon.png" alt="ACWA Power" />
        <h1>ACWA Power — Operations System</h1>
      </div>
      <div class="body">
        <h2>${title}</h2>
        ${bodyHtml}
      </div>
      <div class="footer">
        Delivering power. Improving lives.<br/>
        This is an automated message — do not reply.
      </div>
    </div>
  </body>
  </html>`;
}

// ─── OTP Email ───────────────────────────────────────────────────────────────
exports.sendOtpEmail = async (email, name, otp) => {
  const html = emailTemplate('Verify Your Email', `
    <p>Hello <strong>${name}</strong>,</p>
    <p>Use the OTP below to verify your email address. It expires in <strong>10 minutes</strong>.</p>
    <div class="otp-box"><span>${otp}</span></div>
    <p>If you did not register, ignore this email.</p>
  `);

  await transporter.sendMail({
    from:    FROM,
    to:      email,
    subject: 'Your ACWA Ops Verification Code',
    html,
  });
};

// ─── Password Reset Email ────────────────────────────────────────────────────
exports.sendResetEmail = async (email, name, resetUrl) => {
  const html = emailTemplate('Reset Your Password', `
    <p>Hello <strong>${name}</strong>,</p>
    <p>Click the button below to reset your password. This link expires in <strong>1 hour</strong>.</p>
    <div style="text-align:center;">
      <a href="${resetUrl}" class="btn">Reset Password</a>
    </div>
    <p>If you did not request a reset, ignore this email. Your password will not change.</p>
  `);

  await transporter.sendMail({
    from:    FROM,
    to:      email,
    subject: 'ACWA Ops — Password Reset Request',
    html,
  });
};

// ─── Admin Temp Password Email ───────────────────────────────────────────────
exports.sendTempPasswordEmail = async (email, name, tempPassword) => {
  const html = emailTemplate('Your Password Has Been Reset', `
    <p>Hello <strong>${name}</strong>,</p>
    <p>An administrator has reset your password. Use the temporary password below to log in, then change it immediately.</p>
    <div class="otp-box"><span style="font-size:24px;letter-spacing:0.15em;">${tempPassword}</span></div>
    <p>For security, please update your password after logging in.</p>
  `);

  await transporter.sendMail({
    from:    FROM,
    to:      email,
    subject: 'ACWA Ops — Your Temporary Password',
    html,
  });
};
