# Walter System - Quick Reference

## 🚀 Quick Start

### Local Development
```powershell
# Terminal 1 - Run backend (uses local db.json)
cd server
npm run dev

# Terminal 2 - Run frontend
cd client
npm run dev
```

Your local app: http://localhost:5173  
Local API: http://localhost:3004

---

## 🌐 Production URLs

After Railway deployment:

**Frontend**: https://walter-system-frontend-production.up.railway.app  
**Backend**: https://walter-system-backend-production.up.railway.app  
**Database**: Railway PostgreSQL (managed)

---

## 📊 Database Management

### Migrate Local Data to Production
```powershell
cd server
node migrate-to-postgres.js
```

### Download Production Data to Local
```powershell
.\sync-from-railway.ps1
```
or
```powershell
cd server
node sync-from-production.js
```

---

## 🔄 Deployment Workflow

1. **Make changes locally**
2. **Test with local db.json**
3. **Commit and push**:
   ```powershell
   git add .
   git commit -m "Your changes"
   git push origin main
   ```
4. **Railway auto-deploys** (takes ~2 minutes)
5. **Production database unchanged** ✓

---

## 🛠️ Available NPM Scripts

### Server (in `server/` directory)
```powershell
npm run dev          # Local dev with JSON file
npm run dev:postgres # Local dev with PostgreSQL
npm start            # Production (PostgreSQL)
npm run migrate      # Migrate JSON → PostgreSQL
npm run sync         # Download production → local
```

### Client (in `client/` directory)
```powershell
npm run dev     # Development server
npm run build   # Production build
npm run preview # Preview production build
```

---

## 🔐 Environment Variables

### Server (.env)
```env
NODE_ENV=development
DATABASE_URL=postgresql://...           # Leave empty for local JSON
RAILWAY_DATABASE_URL=postgresql://...  # For sync script
ALLOWED_ORIGIN=https://your-frontend-url
```

### Client
Set in Railway or Vercel:
```env
VITE_API_URL=https://your-backend-url.railway.app
```

---

## 📁 Project Structure

```
walter-system/
├── client/              # React frontend
│   ├── src/
│   │   ├── auth/       # Login & authentication
│   │   └── usersGrid/  # Data grids
│   └── package.json
│
├── server/              # Express backend
│   ├── server.js              # Development (JSON file)
│   ├── server-postgres.js     # Production (PostgreSQL)
│   ├── db.js                  # Database abstraction layer
│   ├── migrate-to-postgres.js # Migration script
│   ├── sync-from-production.js # Sync script
│   ├── db.json               # Local dev data
│   └── package.json
│
└── RAILWAY_SETUP.md     # Full deployment guide
```

---

## ⚠️ Important Notes

### Local vs Production

| Aspect | Local Development | Production (Railway) |
|--------|------------------|---------------------|
| Database | JSON file (`db.json`) | PostgreSQL |
| Data persistence | File on disk | Cloud database |
| Auto-deploy | Manual restart | Auto on git push |
| Cost | Free | $5/month |

### Data Safety Rules

✅ **Safe Operations:**
- Sync production → local (download)
- Test on local db.json
- Deploy code changes

❌ **DON'T:**
- Manually edit production database
- Upload local test data to production
- Commit .env files to Git

---

## 🐛 Troubleshooting

### "Can't connect to database"
- Check DATABASE_URL in Railway
- Verify Postgres service is running
- Check backend logs in Railway

### "Frontend shows no data"
- Check VITE_API_URL is correct
- Verify backend is deployed and running
- Check browser console for errors
- Test backend URL directly in browser

### "Local development not working"
- Make sure db.json exists
- Run `npm install` in server directory
- Check no DATABASE_URL in local .env
- Port 3004 should be free

---

## 📞 Getting Help

- **Railway Docs**: https://docs.railway.app
- **Railway Status**: https://status.railway.app
- **Check Logs**: Railway Dashboard → Your Service → Logs

---

**Last Updated**: October 2025
