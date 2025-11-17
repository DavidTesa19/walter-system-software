# Walter System - AI Agent Instructions

## Architecture Overview

**Monorepo structure** with separate frontend (`client/`) and backend (`server/`) that communicate via REST API. The system manages partners, clients, tipers (tipsters), and employees with an approval workflow and includes an AI chatbot.

### Dual-Mode Backend Operation
The server automatically switches between two database backends:
- **Development**: JSON file storage (`server/data/db.json`) when `DATABASE_URL` is absent
- **Production**: PostgreSQL when `DATABASE_URL` environment variable is present (Railway deployment)

This is handled by `server/db.js` which exports a unified interface used by both `server/server.js` (dev) and `server/server-postgres.js` (production).

## Development Workflow

### Starting the Application
Always run in **two separate terminals** from the workspace root:
```powershell
# Terminal 1: Backend (http://localhost:3004)
npm run server:dev

# Terminal 2: Frontend (http://localhost:5173)
npm run client:dev
```

**Never** use `npm run dev` - it only echoes instructions, doesn't start services.

### First-Time Setup
```powershell
npm run install:all  # Installs root, client/, and server/ dependencies
```

## API Communication Pattern

### Environment-Aware API URL
Frontend uses `VITE_API_URL` environment variable with localhost fallback:
```typescript
// Pattern used in client/src/theme/ThemeContext.tsx and client/src/usersGrid/constants.ts
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3004';
```

**Exception**: `client/src/views/ChatbotView.tsx` hardcodes `http://localhost:3004` for all API calls - update this if adding environment-aware behavior.

### Core API Endpoints
All endpoints support `?status=accepted|pending|archived` query parameter:
- `GET/POST /partners`, `GET/POST /clients`, `GET/POST /tipers`
- `POST /{resource}/:id/approve` - Changes status from pending → accepted
- `POST /api/chat`, `POST /api/chat/stream` - OpenAI chatbot integration
- `GET/POST/PUT/DELETE /api/conversations` - Chatbot conversation persistence

## Key Architectural Patterns

### Status-Based Views
The app uses a **three-view system** mapped to record status:
```typescript
// From client/src/usersGrid/constants.ts
'active' view    → status='accepted'   // Approved records
'pending' view   → status='pending'    // Awaiting approval
'archived' view  → status='archived'   // Historical/removed
```

### AG Grid Integration
All data tables use AG Grid Community with custom cell renderers/editors:
- `DateCellRenderer` + `DatePickerEditor` - Date fields
- `StatusCellRenderer` - Status badges with approve button
- `FieldCellRenderer` - Commission fields with icons
- See `client/src/usersGrid/sections/ClientsSection.tsx` for complete implementation pattern

### Theme System
Dynamic theming via `client/src/theme/ThemeContext.tsx` with:
- **Color palettes** persisted server-side (GET/POST/PUT/DELETE `/color-palettes`)
- **Typography controls** (heading/subheading/body fonts)
- CSS variables injected via `applyPaletteToDOM()` → applied to `:root`
- Default palettes: "Walter Light" and "Walter Dark"

### Authentication
Simple code-based auth in `client/src/auth/AuthContext.tsx`:
- Hardcoded verification: `VERIFICATION_CODE = 'Walter2025'`
- 30-minute sessions with localStorage persistence
- Auto-logout timer with session reset on user activity

## Technology Stack

**Frontend**: React 19 + TypeScript + Vite + AG Grid Community  
**Backend**: Express + Node.js  
**Database**: PostgreSQL (prod) / JSON file (dev)  
**AI Integration**: OpenAI API (GPT models) with streaming support and web search

## Deployment (Railway)

### Production Build Commands
- **Backend**: `cd server && npm install` → `npm start` (runs `server-postgres.js`)
- **Frontend**: `cd client && npm run build` → static site from `client/dist/`

### Environment Variables (Production)
```bash
DATABASE_URL=postgresql://...  # Auto-provided by Railway PostgreSQL service
VITE_API_URL=https://backend-service.railway.app  # Frontend build-time variable
ALLOWED_ORIGIN=https://frontend-service.railway.app  # CORS configuration
```

### Migration Script
`server/migrate-to-postgres.js` - One-time migration from JSON to PostgreSQL (requires both `DATA_FILE` and `DATABASE_URL`)

## Common Gotchas

1. **API URL Inconsistency**: ChatbotView doesn't use `VITE_API_URL` - always uses localhost:3004
2. **Dual Server Files**: `server.js` (dev/JSON) vs `server-postgres.js` (prod/PostgreSQL) - both must stay in sync for API routes
3. **PowerShell Commands**: Use `;` for command chaining, not `&&` (Windows/PowerShell environment)
4. **Grid Row Height**: Computed dynamically in `client/src/usersGrid/utils/gridSizing.ts` - don't hardcode sizes
5. **Status Defaults**: All new submissions default to `status='pending'` via database schema

## File Organization

```
client/src/
├── auth/              # AuthContext + Login + SessionTimer
├── components/        # Sidebar, MarkdownMessage
├── theme/             # ThemeContext + PaletteManager
├── usersGrid/         # AG Grid tables with sections/ and cells/
├── views/             # Main application views (5 total)
└── types/             # TypeScript interfaces

server/
├── server.js          # Dev server (JSON backend)
├── server-postgres.js # Production server (PostgreSQL)
├── db.js              # Unified database abstraction layer
└── migrate-to-postgres.js
```

## Adding New Features

### New Data Table
1. Add table to `server/db.js` `initDatabase()` with status column
2. Create section component in `client/src/usersGrid/sections/`
3. Add API endpoints following `/partners` pattern
4. Register in `UsersGrid.tsx` NAV_CONFIG

### New View
1. Create view component in `client/src/views/`
2. Add to `AppView` type in `client/src/types/appView.ts`
3. Register in `Sidebar.tsx` and `App.tsx` switch statement
