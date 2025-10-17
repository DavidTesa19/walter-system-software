# 🚂 Railway Deployment Guide - Complete Setup

This guide will help you deploy the Walter System to Railway with PostgreSQL database.

## 📋 Table of Contents
1. [Prerequisites](#prerequisites)
2. [Railway Setup](#railway-setup)
3. [Database Setup](#database-setup)
4. [Backend Deployment](#backend-deployment)
5. [Frontend Deployment](#frontend-deployment)
6. [Data Migration](#data-migration)
7. [Testing & Verification](#testing--verification)
8. [Development Workflow](#development-workflow)

---

## Prerequisites

✅ Railway account with paid subscription ($5/month)  
✅ GitHub account with walter-system-software repository  
✅ Local development environment working

---

## Railway Setup

### Step 1: Create New Project

1. Go to **https://railway.app/dashboard**
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Choose **`walter-system-software`** repository
5. Click **"Deploy Now"**

### Step 2: Configure Project

Railway will create a service for your repository. We'll configure it properly next.

---

## Database Setup

### Step 1: Add PostgreSQL Database

1. In your Railway project dashboard, click **"+ New"**
2. Select **"Database"** → **"Add PostgreSQL"**
3. Railway will provision a PostgreSQL database (takes ~30 seconds)
4. You'll see a new **"Postgres"** service in your project

### Step 2: Get Database Connection String

1. Click on the **"Postgres"** service
2. Go to **"Variables"** tab
3. Copy the **`DATABASE_URL`** value (starts with `postgresql://`)
4. **Save this for later** - you'll need it for migration

**Example:**
```
postgresql://postgres:password@containers-us-west-123.railway.app:5432/railway
```

---

## Backend Deployment

### Step 1: Configure Backend Service

1. Click on your **main service** (should show your repo name)
2. Go to **"Settings"** tab
3. Scroll to **"Service Name"** and rename to: `walter-system-backend`
4. Click **"Root Directory"** and set to: `server`
5. In **"Start Command"**, set to: `node server-postgres.js`

### Step 2: Add Environment Variables

1. Go to **"Variables"** tab
2. Click **"+ New Variable"** and add:

```
NODE_ENV=production
PORT=3004
ALLOWED_ORIGIN=https://your-frontend-url.railway.app
```

3. Railway automatically adds `DATABASE_URL` (links to your Postgres service)

### Step 3: Connect Database to Backend

1. In **"Variables"** tab, check if `DATABASE_URL` exists
2. If not, click **"+ New Variable"**
3. Select **"Add Reference"** → Choose your Postgres service → `DATABASE_URL`

### Step 4: Install Dependencies

Railway needs to know to install `pg` package:

1. In your project, I've already prepared everything
2. Railway will automatically run `npm install` in the `server` directory
3. The deployment will start automatically

---

## Frontend Deployment

### Option A: Deploy Frontend on Railway (Recommended)

1. In Railway project, click **"+ New"** → **"GitHub Repo"**
2. Select **same repository** (`walter-system-software`)
3. Configure the new service:
   - **Service Name**: `walter-system-frontend`
   - **Root Directory**: `client`
   - **Build Command**: `npm run build`
   - **Start Command**: `npx vite preview --host 0.0.0.0 --port $PORT`

4. Add environment variable:
   ```
   VITE_API_URL=https://your-backend-url.railway.app
   ```

5. Get your backend URL:
   - Click on `walter-system-backend` service
   - Go to **"Settings"** → **"Networking"**
   - Copy the **public URL** (e.g., `https://walter-system-backend-production.up.railway.app`)

6. Update `VITE_API_URL` with your actual backend URL

### Option B: Deploy Frontend on Vercel (Alternative)

If you prefer Vercel for frontend:

1. Go to **https://vercel.com**
2. Import your GitHub repository
3. Set **Root Directory**: `client`
4. Add environment variable:
   ```
   VITE_API_URL=https://your-backend-url.railway.app
   ```
5. Deploy

---

## Data Migration

Now that your database is set up, let's migrate your local data to Railway PostgreSQL.

### Step 1: Set Up Local Environment

1. In your local project, copy `.env.example` to `.env`:
   ```powershell
   cd server
   Copy-Item .env.example .env
   ```

2. Edit `.env` file and add your Railway database URL:
   ```
   DATABASE_URL=postgresql://postgres:password@...railway.app:5432/railway
   NODE_ENV=development
   ```

### Step 2: Install PostgreSQL Driver

```powershell
cd server
npm install pg
```

### Step 3: Run Migration Script

This will copy all data from `db.json` to Railway PostgreSQL:

```powershell
node migrate-to-postgres.js
```

You should see:
```
🚀 Starting migration from JSON to PostgreSQL...
✓ Loaded JSON data from: db.json
✓ Database tables initialized

📦 Migrating partners...
  ✓ 4 records migrated successfully
📦 Migrating clients...
  ✓ 3 records migrated successfully
📦 Migrating tipers...
  ✓ 3 records migrated successfully

🎉 Migration complete!
📊 Total records migrated: 10
```

### Step 4: Verify Data in Railway

1. Go to Railway dashboard
2. Click on **"Postgres"** service
3. Go to **"Data"** tab
4. You should see your tables with data

---

## Testing & Verification

### Test Backend API

1. Get your backend URL from Railway (e.g., `https://walter-system-backend-production.up.railway.app`)
2. Test health check:
   ```
   https://your-backend-url.railway.app/health
   ```
   Should return:
   ```json
   {
     "ok": true,
     "database": "postgresql",
     "environment": "production"
   }
   ```

3. Test data endpoints:
   ```
   https://your-backend-url.railway.app/partners
   https://your-backend-url.railway.app/clients
   https://your-backend-url.railway.app/tipers
   ```

### Test Frontend

1. Open your frontend URL
2. Try to login
3. Navigate to different grids (Partners, Clients, Tipers)
4. Try CRUD operations:
   - ✅ Create a new record
   - ✅ Edit existing record
   - ✅ Delete a record
5. Check that changes persist after refresh

---

## Development Workflow

### Local Development (Using JSON Files)

When developing locally, your server uses `db.json`:

```powershell
# In server directory
npm run dev
```

- Changes go to local `db.json`
- Does NOT affect production database
- Perfect for testing new features

### Sync Production Data to Local

Want to test with real production data locally?

```powershell
# In server directory
# First, set RAILWAY_DATABASE_URL in .env
node sync-from-production.js
```

This downloads production data to your local `db.json`:
- ✅ Safe - only downloads FROM production
- ✅ Never uploads local changes TO production
- ✅ Great for debugging with real data

### Deploy Updates

1. Make changes locally
2. Test with local JSON database
3. Commit and push to GitHub:
   ```powershell
   git add .
   git commit -m "Your changes"
   git push origin main
   ```
4. Railway **automatically deploys** your changes
5. Database data is **preserved** (not reset)

---

## Important Notes

### ⚠️ Database Persistence

- **Production database is permanent** - data survives deployments
- **Local db.json is for testing** - separate from production
- **Never commit sensitive data** to Git

### 🔒 Security

- Never commit `.env` file to Git (it's in `.gitignore`)
- Keep database credentials secure
- Use environment variables for all sensitive data

### 💰 Costs

- **Railway**: $5/month (includes hosting + PostgreSQL)
- **Data storage**: Included in Railway plan
- **Bandwidth**: Generous free tier, then pay-as-you-go

### 📊 Monitoring

Railway provides:
- **Logs**: Real-time server logs
- **Metrics**: CPU, memory, network usage
- **Alerts**: Email notifications for issues

---

## Troubleshooting

### Backend won't start

1. Check **Logs** in Railway dashboard
2. Verify `DATABASE_URL` is set
3. Verify `server/server-postgres.js` exists
4. Check that `pg` package is installed

### Frontend can't connect to backend

1. Check `VITE_API_URL` environment variable
2. Verify backend URL is correct and accessible
3. Check CORS settings in backend
4. Open browser console for error messages

### Database connection errors

1. Verify `DATABASE_URL` is correct
2. Check if Postgres service is running
3. Restart backend service in Railway
4. Check Railway service logs

### Migration script fails

1. Verify `DATABASE_URL` is set in `.env`
2. Check that `db.json` exists and is valid JSON
3. Check Railway Postgres service is running
4. Look at error message for specific table/field issues

---

## Next Steps

✅ Railway account created and paid  
✅ PostgreSQL database provisioned  
✅ Backend deployed and running  
✅ Frontend deployed and connected  
✅ Data migrated to PostgreSQL  
✅ Production app accessible to client  

**Your app is now production-ready! 🎉**

Your client can use it, and all data is safely stored in Railway's PostgreSQL database. Every time you push code to GitHub, Railway automatically deploys updates without touching the database.

---

## Support

If you need help:
- Railway docs: https://docs.railway.app
- Railway Discord: https://discord.gg/railway
- Check service logs in Railway dashboard
