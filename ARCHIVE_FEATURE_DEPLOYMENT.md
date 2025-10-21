# Archive/Removal Approval Feature - Deployment Guide

## Changes Made

### 1. New "Archived" Status
Items can now have three statuses:
- `pending` - Waiting for approval
- `accepted` - Active/approved items
- `archived` - Items marked for removal (awaiting permanent deletion approval)

### 2. Server Changes (`server/server.js`)
Added new endpoints for all entity types (clients, partners, tipers):

#### Archive Endpoints (Move to Archive)
- `POST /clients/:id/archive` - Marks client as archived
- `POST /partners/:id/archive` - Marks partner as archived
- `POST /tipers/:id/archive` - Marks tiper as archived

#### Restore Endpoints (Restore from Archive)
- `POST /clients/:id/restore` - Restores client back to accepted status
- `POST /partners/:id/restore` - Restores partner back to accepted status
- `POST /tipers/:id/restore` - Restores tiper back to accepted status

### 3. Client Changes

#### Sidebar (`client/src/components/Sidebar.tsx`)
- Added new "Archiv k odstranění" (Archive for Removal) button
- Icon shows an archive/box symbol

#### App (`client/src/App.tsx`)
- Updated to support `'archived'` view mode

#### UsersGrid (`client/src/usersGrid/UsersGrid.tsx`)
- Updated delete behavior:
  - **In Active view**: Delete button now archives the item (moves to archived status)
  - **In Pending view**: Delete button rejects/deletes the pending item
  - **In Archived view**: Delete button permanently removes from database (with confirmation)
  
- Added restore buttons in archived view:
  - Clicking restore button moves item back to accepted status
  - Uses circular arrow icon to indicate restoration

## How It Works

### User Flow

1. **From Active View:**
   - User clicks X button on a client/partner/tiper
   - Confirmation: "Opravdu chcete přesunout... do archivu k odstranění?"
   - Item moves to "Archiv k odstranění" section

2. **In Archived View:**
   - User sees all archived items
   - Two buttons per row:
     - ↻ (Restore) - Returns item to active status
     - ✗ (Delete) - Permanently deletes with strong warning: "TRVALE SMAZAT... Tato akce je NEzvratná!"

3. **From Pending View:**
   - X button still rejects/deletes immediately (no archiving for pending items)

## Deployment Steps

### To Railway:

1. **Commit and push changes:**
   ```powershell
   git add .
   git commit -m "Add archive/removal approval feature"
   git push origin main
   ```

2. **Railway will auto-deploy** if you have auto-deployment enabled.

3. **Manual deploy (if needed):**
   - Go to Railway dashboard
   - Select your project
   - Click "Deploy" or trigger manual deployment

### Testing After Deployment:

1. Navigate to "Aktivní spolupráce" view
2. Click X on any item - should move to archive (not delete)
3. Navigate to "Archiv k odstranění" view
4. Verify archived items appear
5. Test restore button (↻) - should move back to active
6. Test permanent delete (✗) - should show strong warning and permanently delete

## Database Considerations

- Existing items with status `"accepted"` or `"pending"` will continue to work
- No migration needed - the `archived` status is simply a new value for the existing `status` field
- Archived items can be queried with `?status=archived` parameter

## Rollback Plan

If issues occur, you can:
1. Revert the commit: `git revert HEAD`
2. Push: `git push origin main`
3. Railway will auto-deploy the previous version

## Files Modified

- `server/server.js` - Added archive/restore endpoints
- `client/src/App.tsx` - Added archived view mode support
- `client/src/components/Sidebar.tsx` - Added archived view button
- `client/src/usersGrid/UsersGrid.tsx` - Updated delete/restore logic and UI

## Notes

- All confirmation messages are in Czech
- Archive view uses the same approve button styling for restore buttons (green)
- Delete buttons in archive view show red with "TRVALE" (permanent) warning
- The feature maintains backward compatibility with existing data
