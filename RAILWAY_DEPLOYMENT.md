# Railway Deployment Guide - Pending Approval System

## Prerequisites
- Railway account with PostgreSQL database provisioned
- Git repository connected to Railway
- Environment variables configured

## Database Setup

### 1. PostgreSQL Connection
Railway automatically provides `DATABASE_URL` environment variable. The app will:
- Use PostgreSQL when `DATABASE_URL` is present (production)
- Use JSON file when `DATABASE_URL` is absent (local development)

### 2. Automatic Schema Migration
On first deployment, the server will automatically:
1. Create all tables (partners, clients, tipers, users, employees)
2. Add `status` column with default value 'pending'
3. Update existing records to `status = 'accepted'`

### 3. Table Schema
All collaboration tables now include:
```sql
status VARCHAR(50) DEFAULT 'pending'
```

Possible values:
- `'pending'` - Awaiting approval (default for new submissions)
- `'accepted'` - Approved and active

## Deployment Steps

### Step 1: Update Environment Variables
In Railway dashboard, ensure these variables are set:

```bash
DATABASE_URL=postgresql://...  # Auto-provided by Railway
NODE_ENV=production
PORT=3004                       # Optional, Railway provides this
ALLOWED_ORIGIN=https://your-frontend-domain.com  # Optional CORS
```

### Step 2: Deploy Server
```bash
# Push to main branch (triggers Railway deployment)
git add .
git commit -m "Add pending approval system"
git push origin main
```

Railway will automatically:
- Install dependencies
- Run database migrations
- Start the server

### Step 3: Verify Deployment
Check Railway logs for:
```
✓ Using PostgreSQL database
✓ Database tables initialized
Walter System Server Running
Port: 3004
Database: PostgreSQL
```

### Step 4: Update Public Form
Edit `public-submission.html` line 237:
```javascript
const API_BASE_URL = 'https://your-railway-app.railway.app';
```

Replace with your Railway deployment URL.

### Step 5: Host Public Form
Deploy `public-submission.html` to:
- **GitHub Pages**: Free, simple static hosting
- **Netlify**: Drag & drop deployment
- **Vercel**: One-click deployment
- **Railway Static**: Add to same project

## API Endpoints (Production)

Base URL: `https://your-railway-app.railway.app`

### Filtering by Status
```
GET /partners?status=accepted
GET /partners?status=pending
GET /clients?status=accepted
GET /clients?status=pending
GET /tipers?status=accepted
GET /tipers?status=pending
```

### Approval
```
POST /partners/:id/approve
POST /clients/:id/approve
POST /tipers/:id/approve
```

### Create (Public Submissions)
```
POST /partners  # Creates with status: "pending"
POST /clients   # Creates with status: "pending"
POST /tipers    # Creates with status: "pending"
```

## Client App Configuration

Update your `.env` or Railway environment:
```bash
VITE_API_URL=https://your-railway-app.railway.app
```

## Database Migration

### Existing Data
The migration automatically runs on startup:
```sql
-- Add status column to existing tables
ALTER TABLE partners ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending';
ALTER TABLE tipers ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending';

-- Set existing records to 'accepted'
UPDATE partners SET status = 'accepted' WHERE status IS NULL;
UPDATE clients SET status = 'accepted' WHERE status IS NULL;
UPDATE tipers SET status = 'accepted' WHERE status IS NULL;
```

### Manual Migration (if needed)
Connect to Railway PostgreSQL:
```bash
# In Railway dashboard, go to PostgreSQL service
# Click "Connect" and use the provided psql command
```

Check data:
```sql
SELECT id, name, status FROM partners LIMIT 10;
SELECT id, name, status FROM clients LIMIT 10;
SELECT id, name, status FROM tipers LIMIT 10;
```

## Testing Production

### 1. Test Public Submission
1. Open hosted `public-submission.html`
2. Fill form and submit
3. Check Railway logs for successful creation

### 2. Test Main App
1. Login to Walter System
2. Click "Pending Approval" in sidebar
3. Verify submission appears
4. Test approve/reject buttons

### 3. Test API Directly
```bash
# Get pending items
curl https://your-railway-app.railway.app/clients?status=pending

# Get accepted items
curl https://your-railway-app.railway.app/clients?status=accepted

# Create test submission
curl -X POST https://your-railway-app.railway.app/clients \
  -H "Content-Type: application/json" \
  -d '{"name":"Test","company":"Test Co","location":"Praha","mobile":"123456789"}'

# Approve item (replace :id with actual id)
curl -X POST https://your-railway-app.railway.app/clients/1/approve
```

## Rollback Plan

If issues occur:

### Option 1: Revert Status Column
```sql
ALTER TABLE partners DROP COLUMN IF EXISTS status;
ALTER TABLE clients DROP COLUMN IF EXISTS status;
ALTER TABLE tipers DROP COLUMN IF EXISTS status;
```

### Option 2: Set All to Accepted
```sql
UPDATE partners SET status = 'accepted';
UPDATE clients SET status = 'accepted';
UPDATE tipers SET status = 'accepted';
```

### Option 3: Git Revert
```bash
git revert HEAD
git push origin main
```

## Monitoring

### Check Database Status
Railway dashboard → PostgreSQL → Metrics

### Check Server Logs
Railway dashboard → Server Service → Deployments → Logs

Look for:
- Database connection success
- Table initialization
- API requests
- Errors

### Health Check
```bash
curl https://your-railway-app.railway.app/health
```

Expected response:
```json
{
  "ok": true,
  "database": "postgresql",
  "environment": "production"
}
```

## Troubleshooting

### Database Connection Failed
- Verify `DATABASE_URL` is set in Railway
- Check PostgreSQL service is running
- Review connection logs

### Migration Not Running
- Check server logs for initialization messages
- Manually run SQL if needed
- Verify PostgreSQL permissions

### Public Form Can't Submit
- Check CORS configuration
- Verify API URL in form
- Check Railway logs for errors
- Ensure PostgreSQL is accepting connections

### Existing Data Not Showing
- Run migration SQL manually
- Check status filter in queries
- Verify data exists: `SELECT * FROM partners;`

## Security Considerations

### For Production:
1. **CORS**: Set `ALLOWED_ORIGIN` to your frontend domain
2. **Rate Limiting**: Consider adding rate limiting middleware
3. **Validation**: Add input validation for public submissions
4. **Authentication**: Public form is open, main app requires login
5. **SQL Injection**: Using parameterized queries (already implemented)

### Recommended Additions:
```javascript
// Add to server-postgres.js
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/partners', limiter);
app.use('/clients', limiter);
app.use('/tipers', limiter);
```

## Next Steps

1. ✅ Deploy server to Railway
2. ✅ Verify database migrations
3. ✅ Update public form URL
4. ✅ Host public form
5. ✅ Test submission workflow
6. ✅ Monitor logs for 24 hours
7. 📧 Consider adding email notifications
8. 🔒 Add rate limiting for public endpoints
9. 📊 Add analytics/tracking
10. 📝 Document for team

## Support

- Railway Documentation: https://docs.railway.app
- PostgreSQL Docs: https://www.postgresql.org/docs/
- Project Issues: Create issue in repository
