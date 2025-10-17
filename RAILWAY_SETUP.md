# Railway Deployment Guide - Clean Setup

## Prerequisites
- GitHub repository: `DavidTesa19/walter-system-software`
- Railway account with billing set up ($5/month)

## Project Structure
```
├── client/          # React frontend (Vite)
├── server/          # Express backend API
└── server/data/     # PostgreSQL database
```

## Step-by-Step Railway Setup

### Phase 1: Deploy Backend + Database

1. **Create New Railway Project**
   - Go to railway.app
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose: `DavidTesa19/walter-system-software`

2. **Configure Backend Service**
   - Service will be created automatically
   - Go to Settings tab
   - Set Root Directory: `server`
   - Leave build/start commands (will use package.json scripts)

3. **Add PostgreSQL Database**
   - Click "+ New" in your project
   - Select "Database" → "PostgreSQL"
   - Database will be created with automatic DATABASE_URL

4. **Connect Database to Backend**
   - Railway should auto-connect them
   - Check: Backend service should have DATABASE_URL variable
   - If not: Go to backend Variables tab → Add Reference → Select Postgres DATABASE_URL

5. **Generate Backend Domain**
   - Go to backend Settings → Networking
   - Click "Generate Domain"
   - Copy URL (e.g., `walter-backend-production.up.railway.app`)

6. **Verify Backend is Running**
   - Visit: `https://your-backend-url.railway.app/health`
   - Should see: `{"ok":true}`
   - Visit: `https://your-backend-url.railway.app/partners`
   - Should see: JSON array of partners

### Phase 2: Deploy Frontend

7. **Add Frontend Service**
   - In same Railway project, click "+ New"
   - Select "GitHub Repo"
   - Choose: `DavidTesa19/walter-system-software` (same repo)
   - Railway creates second service

8. **Configure Frontend Service**
   - Go to Settings tab
   - Set Root Directory: `client`
   - Set Build Command: `npm install && npm run build`
   - Set Start Command: `npm start`

9. **Add Environment Variable**
   - Go to Variables tab
   - Add variable:
     - Name: `VITE_API_URL`
     - Value: `https://your-backend-url.railway.app` (from step 5)

10. **Generate Frontend Domain**
    - Go to Settings → Networking
    - Click "Generate Domain"
    - Copy URL (e.g., `walter-frontend-production.up.railway.app`)

11. **Test the Application**
    - Visit your frontend URL
    - Should see login page
    - Login and verify data loads

### Phase 3: Rename Services (Optional)

12. **Rename for Clarity**
    - Backend service → "walter-backend"
    - Frontend service → "walter-frontend"
    - This helps distinguish them

## Final Architecture

```
Railway Project: walter-system
├── PostgreSQL Database
├── walter-backend (server/)
│   └── Environment: DATABASE_URL (auto-linked)
└── walter-frontend (client/)
    └── Environment: VITE_API_URL
```

## URLs You'll Get

- Backend API: `https://walter-backend-production.up.railway.app`
- Frontend App: `https://walter-frontend-production.up.railway.app`
- Database: Internal Railway connection (not public)

## Cost

- Total: $5/month (Hobby plan)
- Includes: Backend + Frontend + Database

## Troubleshooting

**Backend won't start:**
- Check Deploy Logs for errors
- Verify DATABASE_URL is set in Variables tab
- Check railway.json has correct server path

**Frontend won't load data:**
- Verify VITE_API_URL is set in Variables tab
- Test backend health endpoint directly
- Check browser console for fetch errors
- Verify CORS is working (already configured in server.js)

**Database connection errors:**
- Make sure Postgres service is running
- Verify DATABASE_URL reference is connected
- Check backend Deploy Logs for connection errors
