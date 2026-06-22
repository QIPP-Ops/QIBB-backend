# QIPP Backend API

Express 5 API for QIPP people-management data (roster, leave, personnel KPIs, PTW, training). Data is stored in **MongoDB Atlas**.

## Prerequisites

- Node.js 18+
- MongoDB Atlas connection string
- SMTP or Resend credentials (for OTP and password reset emails)

## Setup

1. Clone the repository and install dependencies:

```bash
npm install
```

2. Copy environment template and configure:

```bash
cp .env.example .env
```

Required variables:

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | MongoDB Atlas connection string |
| `JWT_SECRET` | Secret for signing JWTs (32+ chars recommended) |
| `PORT` | HTTP port (default `5000`) |
| `FRONTEND_URL` | Frontend origin for reset links and CORS |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Outbound email (or use `RESEND_API_KEY`) |

### Crew Chat (optional)

| Variable | Description |
|----------|-------------|
| `R2_ACCOUNT_ID` | Cloudflare account ID for R2 |
| `R2_ACCESS_KEY_ID` | R2 API token access key |
| `R2_SECRET_ACCESS_KEY` | R2 API token secret |
| `R2_BUCKET_NAME` | Bucket name (default `qipp-chats`) |
| `R2_PUBLIC_URL` | Optional CDN base; empty = signed URLs only |
| `CHAT_MAX_FILE_MB` | Max upload size per file (default `25`) |
| `CHAT_EMAIL_ON_MENTION` | Set `1` to email offline users on @mention |

Real-time chat uses **Socket.io** on the same HTTP server (`/socket.io`). REST API under `/api/chat/*`.

3. Start the server:

```bash
npm run dev    # development (nodemon)
npm start      # production
```

4. Health checks: `GET /health`, `GET /ready` (DB connectivity)

5. Seed database:

```bash
npm run seed:mongodb
```

## Production deployment

- **Backend:** Render (`render.yaml`) — https://qibb-backend.onrender.com
- **Frontend:** GitHub Pages — https://acwaops.com/qipp
- **Database:** MongoDB Atlas

See `docs/MIGRATION_RENDER.md` for full setup.

## Tests

```bash
npm test
```
