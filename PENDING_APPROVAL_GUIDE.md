# Pending Approval System - Implementation Guide

## Overview
This system adds a two-tier approval workflow for Clients, Partners, and Tipers. Public submissions go through a pending approval process before becoming active collaborations.

## Architecture

### 1. **Database Schema**
All entities (partners, clients, tipers) now include a `status` field:
- `"accepted"` - Active/approved collaborations (default for existing data)
- `"pending"` - Awaiting approval from management

### 2. **Main Application Features**

#### Sidebar Navigation
- **Active Collaborations**: Shows all accepted entries
- **Pending Approval**: Shows all pending entries awaiting review

#### View Modes
- **Active View**: 
  - Displays only accepted entries
  - Delete button removes entries permanently
  - Full editing capabilities
  
- **Pending View**:
  - Displays only pending entries
  - **Approve button** (green checkmark): Moves entry to active status
  - **Reject button** (red X): Permanently deletes the entry
  - Full editing capabilities before approval

### 3. **Public Submission Page**

#### File Location
`public-submission.html` - Standalone HTML file for public access

#### Features
- Type selector: Switch between Client/Partner/Tiper forms
- Simple form with required fields:
  - Name
  - Company
  - Location
  - Mobile
- Automatic submission with `status: "pending"`
- Success/Error messaging
- Responsive design

#### Configuration
Update the API URL in `public-submission.html`:
```javascript
// For local development
const API_BASE_URL = 'http://localhost:3004';

// For production
const API_BASE_URL = 'https://your-railway-app.railway.app';
```

## API Endpoints

### New/Modified Endpoints

#### GET with Status Filter
```
GET /partners?status=accepted  # Returns only accepted partners
GET /partners?status=pending   # Returns only pending partners
GET /clients?status=accepted   # Returns only accepted clients
GET /clients?status=pending    # Returns only pending clients
GET /tipers?status=accepted    # Returns only accepted tipers
GET /tipers?status=pending     # Returns only pending tipers
```

#### Approval Endpoints
```
POST /partners/:id/approve  # Changes status from pending to accepted
POST /clients/:id/approve   # Changes status from pending to accepted
POST /tipers/:id/approve    # Changes status from pending to accepted
```

#### Create Endpoints (Modified)
All POST endpoints now default to `status: "pending"`:
```
POST /partners  # Creates partner with status: "pending"
POST /clients   # Creates client with status: "pending"
POST /tipers    # Creates tiper with status: "pending"
```

## Usage Workflow

### For Public Users
1. Open `public-submission.html` in browser
2. Select collaboration type (Client/Partner/Tiper)
3. Fill out form with details
4. Submit - entry created with `status: "pending"`

### For Management (Internal App)
1. Login to Walter System
2. Click "Pending Approval" in sidebar
3. Review pending submissions
4. For each entry:
   - **Approve**: Click green checkmark ✓ → Moves to Active
   - **Reject**: Click red X → Permanently deletes
   - **Edit**: Modify fields before approving
5. Switch to "Active Collaborations" to see approved entries

## Deployment Notes

### Local Development
1. Server runs on `http://localhost:3004`
2. Use JSON file database (`server/db.json`)
3. Public form points to localhost

### Production (Railway)
1. Server deployed with PostgreSQL
2. Update `public-submission.html` API_BASE_URL to Railway URL
3. Host `public-submission.html` separately or serve via static hosting
4. Ensure CORS allows public domain access

### Hosting Public Form
Options for hosting `public-submission.html`:
- **GitHub Pages**: Free static hosting
- **Netlify/Vercel**: Free tier available
- **Same server**: Add static file serving to Express
- **Any web hosting**: Upload HTML file

## Migration

### Existing Data
All existing partners, clients, and tipers have been updated with `status: "accepted"` to maintain current functionality.

### Database Update Script
If you need to manually update existing entries:
```javascript
// Add to all existing records
db.partners = db.partners.map(p => ({ ...p, status: p.status || 'accepted' }));
db.clients = db.clients.map(c => ({ ...c, status: c.status || 'accepted' }));
db.tipers = db.tipers.map(t => ({ ...t, status: t.status || 'accepted' }));
```

## Files Modified/Created

### Created
- `client/src/components/Sidebar.tsx` - Navigation sidebar
- `client/src/components/Sidebar.css` - Sidebar styles
- `public-submission.html` - Public submission form

### Modified
- `server/server.js` - Added status filtering and approval endpoints
- `server/db.json` - Added status field to all records
- `client/src/App.tsx` - Integrated sidebar and view switching
- `client/src/usersGrid/UsersGrid.tsx` - Added view mode prop and approve buttons
- `client/src/usersGrid/UsersGrid.css` - Added approve button styles

## Testing Checklist

- [ ] Public form submits successfully
- [ ] Pending entries appear in "Pending Approval" view
- [ ] Approve button moves entry to active
- [ ] Reject button deletes entry
- [ ] Active view shows only accepted entries
- [ ] Pending view shows only pending entries
- [ ] All three entity types work (Clients/Partners/Tipers)
- [ ] Form validation works correctly
- [ ] Error handling displays appropriate messages

## Future Enhancements

Potential improvements:
- Email notifications on submission
- Admin user roles/permissions
- Bulk approve/reject
- Submission history/audit log
- Comments/notes on pending entries
- Automatic approval rules
- Integration with external forms (TypeForm, Google Forms, etc.)
