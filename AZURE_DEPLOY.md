# Azure Deployment Notes (Backend API)

## Azure resources

- **Resource group:** `AcwaOpsQIPP` (West Europe)
- **App Service plan:** `plan-qibb-qipp` (shared with the frontend web app `qippop`)
- **Web App:** `qipp-api` → https://qipp-api.azurewebsites.net  
  API routes are under `/api` (e.g. https://qipp-api.azurewebsites.net/api/auth/login).

The workflow (`.github/workflows/deploy-azure-webapp.yml`) runs `npm ci --omit=dev` and deploys the repo root (including `node_modules`). Startup command on Azure is **`node index.js`**.

## GitHub repository secret

**`AZURE_WEBAPP_PUBLISH_PROFILE`** — publish profile XML for Web App **`qipp-api`** (not the frontend).

```bash
az webapp deployment list-publishing-profiles --name qipp-api --resource-group AcwaOpsQIPP --xml
```

Paste the full XML into **this repo’s** Actions secret (`QIBB-backend`). It must not be the same profile as `qippop`.

## Application settings (Azure Portal or CLI)

Configure these on **Web App → Configuration → Application settings** (do not commit real values to git):

| Name | Purpose |
|------|---------|
| **`COSMOS_CONNECTION_STRING`** | MongoDB connection string for Cosmos DB for MongoDB API (`mongoose` uses this in `config/db.js`). |
| **`JWT_SECRET`** | Secret for signing JWTs (same variable name as local `.env`). |

`PORT` is provided by App Service; do not override unless you know you need to.

### Cosmos networking

If the database rejects connections, open **Cosmos DB → Networking** and allow access from Azure or add the App Service **outbound IP addresses** (shown under Web App **Properties**) to the firewall allowlist.

## Frontend pairing

The frontend repo secret **`NEXT_PUBLIC_API_URL`** should match this API base URL, including `/api`:

`https://qipp-api.azurewebsites.net/api`

Redeploy the frontend after changing it.

## Checks after deploy

1. `GET https://qipp-api.azurewebsites.net/health` → JSON with status UP  
2. Exercise login from the deployed frontend against the API URL above.
