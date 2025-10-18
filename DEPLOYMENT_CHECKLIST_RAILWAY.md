# Railway Deployment Checklist

## Pre-Deployment
- [x] Database schema updated with `status` column
- [x] Server endpoints support status filtering
- [x] Approval endpoints implemented
- [x] Automatic migration for existing data
- [x] Default status set to 'pending' for new records
- [x] Public submission form created

## Railway Configuration

### 1. Create PostgreSQL Database
```
✓ Go to Railway dashboard
✓ Click "New Project"
✓ Select "Provision PostgreSQL"
✓ Note: DATABASE_URL is automatically provided
```

### 2. Connect GitHub Repository
```
✓ In Railway project, click "New Service"
✓ Select "GitHub Repo"
✓ Connect walter-system-software
✓ Select main branch
```

### 3. Environment Variables (Server Service)
Set these in Railway dashboard under Variables:
```bash
NODE_ENV=production
DATABASE_URL=<auto-provided by Railway>
PORT=<auto-provided by Railway>
ALLOWED_ORIGIN=https://your-frontend-domain.com  # Optional
```

### 4. Configure Build Settings
Railway should auto-detect, but verify:
```
Build Command: cd server && npm install
Start Command: cd server && npm start
Root Directory: /
```

## Deployment Process

### Step 1: Push to Railway
```bash
# Commit all changes
git add .
git commit -m "Add pending approval system with PostgreSQL support"
git push origin main
```

### Step 2: Verify Deployment
Check Railway logs for these messages:
```
✓ Using PostgreSQL database
✓ Database tables initialized
╔════════════════════════════════════════╗
║   Walter System Server Running         ║
╠════════════════════════════════════════╣
║  Port: 3004                        
║  Database: PostgreSQL              
║  Environment: production           
╚════════════════════════════════════════╝
```

### Step 3: Test Database
Run these in Railway PostgreSQL Query tab:
```sql
-- Check tables exist
\dt

-- Check partners table structure
\d partners

-- Verify status column exists
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'partners' AND column_name = 'status';

-- Check if any data exists
SELECT COUNT(*) FROM partners;
SELECT COUNT(*) FROM clients;
SELECT COUNT(*) FROM tipers;
```

### Step 4: Test API Endpoints
Replace `<railway-url>` with your Railway domain:

```bash
# Health check
curl https://<railway-url>/health

# Get all partners
curl https://<railway-url>/partners

# Get pending partners
curl https://<railway-url>/partners?status=pending

# Get accepted partners
curl https://<railway-url>/partners?status=accepted

# Create test submission (should default to pending)
curl -X POST https://<railway-url>/clients \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Client",
    "company": "Test Company",
    "location": "Praha",
    "mobile": "+420 123 456 789"
  }'

# Approve the submission (use ID from previous response)
curl -X POST https://<railway-url>/clients/1/approve
```

## Client App Deployment

### Step 5: Update Client Environment
Set in Railway (client service) or Vercel/Netlify:
```bash
VITE_API_URL=https://<your-railway-server-url>
```

### Step 6: Deploy Client
```bash
# If using separate Railway service
git push origin main

# If using Vercel/Netlify
# Follow their deployment process
```

## Public Form Deployment

### Step 7: Update Form API URL
Edit `public-submission.html` line 237:
```javascript
const API_BASE_URL = 'https://<your-railway-server-url>';
```

### Step 8: Host Public Form

#### Option A: GitHub Pages
```bash
# Create gh-pages branch
git checkout -b gh-pages
git add public-submission.html
git commit -m "Add public submission form"
git push origin gh-pages

# Enable in GitHub Settings → Pages
# URL: https://<username>.github.io/<repo>/public-submission.html
```

#### Option B: Netlify
```
1. Go to Netlify dashboard
2. Drag & drop public-submission.html
3. Get URL: https://random-name.netlify.app
```

#### Option C: Vercel
```bash
vercel --prod public-submission.html
```

#### Option D: Railway Static
```
1. Create new service in Railway
2. Select "Empty Service"
3. Add static file serving
4. Upload public-submission.html
```

## Post-Deployment Testing

### Test Workflow
1. **Public Submission**
   - [ ] Open public form URL
   - [ ] Select "Client" tab
   - [ ] Fill form with test data
   - [ ] Submit successfully
   - [ ] See success message

2. **Check Railway Logs**
   - [ ] See POST request to /clients
   - [ ] No errors in logs
   - [ ] Record created with status: "pending"

3. **Main App - Pending View**
   - [ ] Login to main app
   - [ ] Click "Pending Approval" in sidebar
   - [ ] See test submission in Clients table
   - [ ] Green checkmark button visible
   - [ ] Red X button visible

4. **Approve Submission**
   - [ ] Click green checkmark
   - [ ] Record disappears from pending view
   - [ ] Switch to "Active Collaborations"
   - [ ] See approved record

5. **Test All Types**
   - [ ] Repeat for Partners
   - [ ] Repeat for Tipers

## Database Verification

### Check Data Status
```sql
-- See all records with their status
SELECT id, name, company, status FROM partners ORDER BY id;
SELECT id, name, company, status FROM clients ORDER BY id;
SELECT id, name, company, status FROM tipers ORDER BY id;

-- Count by status
SELECT status, COUNT(*) FROM partners GROUP BY status;
SELECT status, COUNT(*) FROM clients GROUP BY status;
SELECT status, COUNT(*) FROM tipers GROUP BY status;

-- Find any NULL status (shouldn't exist after migration)
SELECT * FROM partners WHERE status IS NULL;
SELECT * FROM clients WHERE status IS NULL;
SELECT * FROM tipers WHERE status IS NULL;
```

## Troubleshooting

### If deployment fails:
1. Check Railway build logs
2. Verify package.json scripts
3. Ensure DATABASE_URL is present
4. Check server/package.json exists

### If database migration doesn't run:
1. Check Railway logs for "Database tables initialized"
2. Manually run migration SQL in PostgreSQL query tab
3. Verify PostgreSQL service is running

### If API returns errors:
1. Check CORS settings
2. Verify DATABASE_URL is correct
3. Test database connection
4. Review server logs

### If public form can't submit:
1. Verify API URL is correct
2. Check browser console for errors
3. Test API endpoint with curl
4. Check CORS allows form domain

## Monitoring

### Regular Checks
- [ ] Railway server uptime
- [ ] PostgreSQL database health
- [ ] API response times
- [ ] Error logs
- [ ] Pending submissions count

### Set Up Alerts
```
Railway Dashboard → Settings → Notifications
- Deployment failures
- High error rate
- Database connection issues
```

## Rollback

If major issues occur:

### Quick Rollback
```bash
# In Railway dashboard
Deployments → Previous deployment → Redeploy
```

### Git Rollback
```bash
git revert HEAD
git push origin main
```

### Database Rollback
```sql
-- Remove status column if needed
ALTER TABLE partners DROP COLUMN status;
ALTER TABLE clients DROP COLUMN status;
ALTER TABLE tipers DROP COLUMN status;
```

## Success Criteria

Deployment is successful when:
- [x] Server running on Railway
- [x] PostgreSQL connected
- [x] All tables created with status column
- [x] Existing data marked as 'accepted'
- [x] Public form accepting submissions
- [x] Submissions appear in pending view
- [x] Approve button moves to active view
- [x] Reject button deletes entries
- [x] No errors in logs
- [x] All three entity types working

## Next Steps After Deployment

1. **Monitor for 24 hours**
   - Check logs regularly
   - Test all functionality
   - Watch for errors

2. **Share Public Form**
   - Add to website
   - Share URL with stakeholders
   - Test from multiple devices

3. **Team Training**
   - Show pending approval workflow
   - Demonstrate approve/reject
   - Document processes

4. **Consider Enhancements**
   - Email notifications
   - Bulk operations
   - Audit logging
   - User roles

## Contact/Support

- Railway Docs: https://docs.railway.app
- PostgreSQL Docs: https://www.postgresql.org/docs/
- Repository Issues: GitHub Issues
