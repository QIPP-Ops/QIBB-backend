# QIPP Backend API

Express 5 API for QIPP operational data (roster, KPIs, PTW, plant trends). Data is stored in **MongoDB Atlas**. Plant trends are served from **bundled JSON** in `data/trends-blobs/`.

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
| `TRENDS_BLOBS_DIR` | Optional — path to six trend JSON files (default `data/trends-blobs`) |

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

## Trends data

Six JSON files in `data/trends-blobs/` are the sole source for trend charts:

- `daily_ops.json`, `water.json`, `hrsg.json`, `fg_filter.json`, `air_intake.json`, `environment.json`

The API merges them via `GET /api/plant-data/trends-bundle`. See `docs/TRENDS_DATA_MAP.md`.

## Production deployment

- **Backend:** Render (`render.yaml`) — https://qibb-backend.onrender.com
- **Frontend:** GitHub Pages — https://acwaops.com/qipp
- **Database:** MongoDB Atlas

See `docs/MIGRATION_RENDER.md` for full setup.

## Tests

```bash
npm test
```
