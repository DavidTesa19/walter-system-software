# ✅ Railway Deployment Checklist

Follow these steps in order to deploy your Walter System to Railway with PostgreSQL.

---

## Phase 1: Railway Project Setup (15 minutes)

### ☐ 1.1 Create Railway Account
- [ ] Go to https://railway.app
- [ ] Sign up with your GitHub account
- [ ] Verify your email
- [ ] Add payment method (will charge $5/month after free credits)

### ☐ 1.2 Create New Project
- [ ] Click "New Project" in Railway dashboard
- [ ] Select "Deploy from GitHub repo"
- [ ] Choose `DavidTesa19/walter-system-software`
- [ ] Wait for initial deployment to complete

### ☐ 1.3 Add PostgreSQL Database
- [ ] In project dashboard, click "+ New"
- [ ] Select "Database" → "Add PostgreSQL"
- [ ] Wait for provisioning (~30 seconds)
- [ ] Verify "Postgres" service appears in dashboard

---

## Phase 2: Backend Configuration (20 minutes)

### ☐ 2.1 Configure Backend Service
- [ ] Click on your main service (shows repo name)
- [ ] Go to "Settings" tab
- [ ] Change "Service Name" to: `walter-system-backend`
- [ ] Set "Root Directory" to: `server`
- [ ] Set "Start Command" to: `node server-postgres.js`
- [ ] Click "Deploy" if changes don't auto-deploy

### ☐ 2.2 Set Environment Variables
- [ ] Go to "Variables" tab on backend service
- [ ] Verify `DATABASE_URL` exists (auto-added by Railway)
- [ ] Add variable `NODE_ENV` = `production`
- [ ] Add variable `PORT` = `3004`
- [ ] Add variable `ALLOWED_ORIGIN` = `*` (we'll update this later)

### ☐ 2.3 Get Backend URL
- [ ] Go to "Settings" tab → "Networking"
- [ ] Click "Generate Domain" if not already generated
- [ ] Copy the public URL (e.g., `https://walter-system-backend-production.up.railway.app`)
- [ ] **Save this URL** - you'll need it for frontend and testing

### ☐ 2.4 Test Backend
- [ ] Open backend URL in browser: `https://your-backend-url/health`
- [ ] Should see: `{"ok":true,"database":"postgresql","environment":"production"}`
- [ ] If error, check deployment logs in Railway

---

## Phase 3: Get Database Credentials (5 minutes)

### ☐ 3.1 Copy Database URL
- [ ] Click on "Postgres" service in Railway
- [ ] Go to "Variables" tab
- [ ] Find and copy `DATABASE_URL` value
- [ ] It looks like: `postgresql://postgres:password@host:5432/railway`
- [ ] **Save this** - you'll need it for data migration

---

## Phase 4: Local Data Migration (15 minutes)

### ☐ 4.1 Set Up Local Environment File
- [ ] On your computer, navigate to project folder
- [ ] Open folder: `server`
- [ ] Copy file `.env.example` to `.env`
- [ ] Open `.env` file in editor

### ☐ 4.2 Configure .env File
- [ ] In `.env`, paste your Railway DATABASE_URL:
  ```
  DATABASE_URL=postgresql://postgres:password@...railway.app:5432/railway
  ```
- [ ] Save the file

### ☐ 4.3 Run Migration Script
- [ ] Open PowerShell in project root
- [ ] Run commands:
  ```powershell
  cd server
  node migrate-to-postgres.js
  ```
- [ ] You should see successful migration messages
- [ ] Note the number of records migrated

### ☐ 4.4 Verify Data in Railway
- [ ] Go back to Railway dashboard
- [ ] Click on "Postgres" service
- [ ] Go to "Data" tab
- [ ] Check tables: partners, clients, tipers
- [ ] Verify your data appears

---

## Phase 5: Frontend Deployment (20 minutes)

### ☐ 5.1 Create Frontend Service
- [ ] In Railway project, click "+ New"
- [ ] Select "GitHub Repo"
- [ ] Choose same repository: `walter-system-software`
- [ ] Configure the service:
  - Service Name: `walter-system-frontend`
  - Root Directory: `client`

### ☐ 5.2 Configure Frontend Build
- [ ] Go to "Settings" tab
- [ ] Under "Build Command": `npm run build`
- [ ] Under "Start Command": Leave empty (uses package.json)

### ☐ 5.3 Set Frontend Environment Variables
- [ ] Go to "Variables" tab
- [ ] Add variable:
  ```
  VITE_API_URL=https://your-backend-url.railway.app
  ```
- [ ] Replace with your actual backend URL from step 2.3
- [ ] Click "Deploy" if needed

### ☐ 5.4 Generate Frontend Domain
- [ ] Go to "Settings" → "Networking"
- [ ] Click "Generate Domain"
- [ ] Copy frontend URL (e.g., `https://walter-system-frontend-production.up.railway.app`)

### ☐ 5.5 Update Backend CORS
- [ ] Go back to backend service
- [ ] Go to "Variables" tab
- [ ] Update `ALLOWED_ORIGIN` to your frontend URL
- [ ] Backend will automatically redeploy

---

## Phase 6: Testing & Verification (15 minutes)

### ☐ 6.1 Test Backend API
- [ ] Open: `https://your-backend-url/health`
- [ ] Should show: database: "postgresql"
- [ ] Test: `https://your-backend-url/partners`
- [ ] Should return JSON array with your partner data
- [ ] Test: `https://your-backend-url/clients`
- [ ] Test: `https://your-backend-url/tipers`

### ☐ 6.2 Test Frontend Application
- [ ] Open your frontend URL in browser
- [ ] Try to login (use your existing credentials)
- [ ] Navigate to Partners grid
- [ ] Try to add a new partner
- [ ] Try to edit a partner
- [ ] Try to delete a test partner
- [ ] Refresh page - data should persist

### ☐ 6.3 Verify Data Persistence
- [ ] Make a change in the app (add/edit record)
- [ ] Close browser completely
- [ ] Reopen frontend URL
- [ ] Verify your change is still there
- [ ] Go to Railway → Postgres → Data tab
- [ ] Verify change appears in database

---

## Phase 7: Share with Client (5 minutes)

### ☐ 7.1 Prepare Client Information
- [ ] Copy your frontend URL
- [ ] Test it in incognito/private browser window
- [ ] Create a simple guide with:
  - Frontend URL
  - Login credentials
  - Basic usage instructions

### ☐ 7.2 Send to Client
- [ ] Email or share the frontend URL
- [ ] Provide login credentials
- [ ] Ask for feedback on performance and features

---

## Phase 8: Set Up Development Workflow (10 minutes)

### ☐ 8.1 Create Local .env for Development
- [ ] In `server/.env`, add second line:
  ```
  RAILWAY_DATABASE_URL=postgresql://...
  ```
- [ ] Keep DATABASE_URL empty for local dev:
  ```
  DATABASE_URL=
  RAILWAY_DATABASE_URL=postgresql://your-railway-url
  ```

### ☐ 8.2 Test Local Development
- [ ] Open terminal in `server` folder
- [ ] Run: `npm run dev` (should use local db.json)
- [ ] Open terminal in `client` folder
- [ ] Run: `npm run dev`
- [ ] Test that local version works with db.json

### ☐ 8.3 Test Production Data Sync
- [ ] When you want to test with real data:
  ```powershell
  cd server
  node sync-from-production.js
  ```
- [ ] Verify db.json updated with production data
- [ ] Make test changes locally
- [ ] Verify they DON'T affect production

---

## ✅ Completion Checklist

- [ ] Railway account created and paid
- [ ] PostgreSQL database provisioned
- [ ] Backend deployed and accessible
- [ ] Frontend deployed and accessible
- [ ] Local data migrated to PostgreSQL
- [ ] CRUD operations working (Create, Read, Update, Delete)
- [ ] Data persists after refresh
- [ ] Client can access the application
- [ ] Local development still works
- [ ] Can sync production data to local

---

## 📝 Important URLs to Save

```
Production Frontend: https://_____________________________.railway.app
Production Backend:  https://_____________________________.railway.app
Railway Dashboard:   https://railway.app/project/_______________
GitHub Repo:         https://github.com/DavidTesa19/walter-system-software
```

---

## 🚨 If Something Goes Wrong

### Backend Issues
1. Check Railway logs: Backend Service → Logs tab
2. Verify DATABASE_URL is set
3. Check Start Command is `node server-postgres.js`
4. Verify `pg` package is installed

### Frontend Issues
1. Check VITE_API_URL is correct
2. Open browser console (F12) for errors
3. Test backend URL directly
4. Check Railway logs

### Database Issues
1. Verify Postgres service is running
2. Check DATABASE_URL connection string
3. Test connection from backend logs
4. Re-run migration if needed

### Need to Start Over?
1. Delete Railway project
2. Create new project
3. Follow checklist again
4. Previous database data is lost (use backup)

---

## 💡 Tips

- **Bookmark** your Railway dashboard
- **Save** all URLs in a password manager
- **Test** thoroughly before sharing with client
- **Monitor** Railway usage to avoid surprise costs
- **Commit** code changes regularly
- **Pull** before making changes (if working from multiple computers)

---

**Estimated Total Time**: ~90 minutes  
**Cost**: $5/month  
**Result**: Production-ready application with real database! 🎉
