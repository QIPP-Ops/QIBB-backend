# Azure Deployment Notes (Backend)

## Required GitHub Secrets

- `AZURE_WEBAPP_NAME`: Azure backend web app name (for example `QIPP-Backend`)
- `AZURE_WEBAPP_PUBLISH_PROFILE`: Publish profile XML from Azure Web App

## Required Azure App Settings

- `MONGODB_URI`
- `JWT_SECRET`

Optional:

- `ROSTER_SAS_URL`

## Post-deploy checks

1. Verify health endpoint:
   - `https://<your-backend-domain>/health`
2. Seed demo users/data when needed:
   - SSH into app and run `node /home/site/wwwroot/seed-demo.js`
   - or run locally with the same `MONGODB_URI`
