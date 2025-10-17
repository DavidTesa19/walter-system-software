# Data Sync Guide

## Overview
- **Production (Railway)**: Real database where client data is stored
- **Local Development**: Test environment using JSON files
- **Sync Direction**: Railway → Local (one-way only)

## How to Sync Data from Railway to Local

### Step 1: Get Your Railway Database URL

1. Go to Railway dashboard
2. Click on your **Postgres** service
3. Go to **"Variables"** tab
4. Copy the **`DATABASE_URL`** value (starts with `postgresql://`)

### Step 2: Set the Environment Variable

**In PowerShell:**
```powershell
$env:RAILWAY_DATABASE_URL = "your-database-url-here"
```

**Example:**
```powershell
$env:RAILWAY_DATABASE_URL = "postgresql://postgres:password@containers.railway.app:5432/railway"
```

### Step 3: Run the Sync

**Option A - Using npm script (from server folder):**
```bash
cd server
npm run sync
```

**Option B - Using PowerShell script (from root):**
```powershell
.\sync-from-railway.ps1
```

### What Happens During Sync

1. ✅ Connects to Railway PostgreSQL database
2. ✅ Downloads all partner data
3. ✅ Creates backup of your current local data
4. ✅ Overwrites local `db.json` files with Railway data
5. ✅ Your local development now has latest production data

## Important Notes

⚠️ **Local changes are NOT pushed to Railway**
- This is intentional for safety
- Local is for testing only
- Production data stays safe

📦 **Automatic Backups**
- Each sync creates a backup file: `db.backup.[timestamp].json`
- You can restore from backups if needed

🔄 **When to Sync**
- Before starting development
- After your client adds important data
- When you want to test with real data

## Development Workflow

### For Local Testing:
```bash
cd server
npm run dev
```
- Uses local `db.json` files
- Changes don't affect production

### For Production:
- Push changes to GitHub
- Railway auto-deploys
- Uses PostgreSQL database
- Client data is persistent and safe

## Troubleshooting

**"RAILWAY_DATABASE_URL not set" error:**
- Make sure you set the environment variable in Step 2
- Check that you copied the full URL including `postgresql://`

**"Connection refused" error:**
- Verify the database URL is correct
- Check your internet connection
- Make sure Railway database is running
