# Auth API contract (QIPP)

Shared contract between **QIBB-backend-main** and **QIBB-frontend-master**.

## User model fields (MongoDB `AdminUser`)

| Field | Type | Notes |
|-------|------|--------|
| `email` | string | Unique |
| `passwordHash` | string | Never returned to clients |
| `accessRole` | `admin` \| `viewer` | JWT `role` claim mirrors this |
| `isApproved` | boolean | Admin must approve unless auto-approved domain |
| `isEmailVerified` | boolean | Required before login |
| `otpHash` | string \| null | Bcrypt hash of 6-digit OTP |
| `otpExpiresAt` | Date \| null | OTP expiry |
| `resetToken` | string \| null | SHA-256 hex of reset token |
| `resetTokenExpires` | Date \| null | Reset link expiry |

**Do not** use legacy names: `emailVerified`, `otpExpiry`, `resetTokenHash`, `resetTokenExpiry`.

## Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/auth/register-options` | Public | Crews/roles for registration form |
| POST | `/api/auth/register` | Public | Create account (`accessRole` ignored; always `viewer`) |
| POST | `/api/auth/verify-otp` | Public | Verify email with OTP |
| POST | `/api/auth/resend-otp` | Public | Resend OTP |
| POST | `/api/auth/login` | Public | Returns `{ token, role }` |
| GET | `/api/auth/verify` | Bearer | Returns `{ ok: true, user }` |
| POST | `/api/auth/forgot-password` | Public | Sends reset email |
| POST | `/api/auth/reset-password` | Public | Body: `email`, `token`, `newPassword` |

## Login error codes

| HTTP | `code` | Meaning |
|------|--------|---------|
| 403 | `EMAIL_NOT_VERIFIED` | OTP verification required |
| 403 | `PENDING_APPROVAL` | Awaiting admin approval |

## JWT payload

```json
{
  "id": "<ObjectId>",
  "email": "user@acwapower.com",
  "role": "viewer",
  "name": "Name",
  "empId": "EMP001",
  "crew": "Crew A"
}
```

Expiry: 7 days. Secret: `JWT_SECRET` env var.

## Auto-approved email domains

`acwapower.com`, `nomac.com`, `acwaops.com` — `isApproved` set true on register. OTP is still required for all domains before login.

## Future (not implemented)

- httpOnly session cookies via BFF
- API prefix `/api/v1`
