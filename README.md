# Walter System Software

React (Vite) frontend + Express API with JSON file persistence. Monorepo structure with separate client/ and server/ folders.

## Structure

```
walter-system-software/
├── client/          # React frontend (Vite)
├── server/          # Node.js Express API
├── package.json     # Root scripts for convenience
└── README.md
```

## Local Development

1) Install all dependencies

```
npm run install:all
```

2) Start server (in one terminal)

```
npm run server:dev
```

3) Start client (in another terminal)

```
npm run client:dev
```

The client will be available at http://localhost:5173 (or another port if busy) and will call the API at http://localhost:3004.

## Client (Frontend)
- Location: `client/`
- Tech: React + TypeScript + Vite + AG Grid
- Reads API base URL from `VITE_API_URL` (see `client/.env.example`)
- Build: `npm run client:build` → outputs to `client/dist`

## Server (Backend)
- Location: `server/`
- Tech: Node.js + Express
- File: `server/server.js`
- Port: `PORT` env (defaults 3004)
- Data dir: `DATA_DIR` env (defaults `./data`)
- API Endpoints:
  - `GET /users` — list users
  - `POST /users` — create user (auto-increment id)
  - `PUT /users/:id` — replace user
  - `PATCH /users/:id` — partial update
  - `DELETE /users/:id` — delete user
  - `GET /health` — health check

## Deploy to Render (separate services)

### 1. Server (Web Service)
- Create Web Service from this repo
- Root Directory: `server`
- Build Command: `npm install`
- Start Command: `npm start`
- Add a Render Disk (e.g., 1GB) mounted to `/opt/render/project/src/data`
- Set env var `DATA_DIR=/opt/render/project/src/data`
- (optional) Set `ALLOWED_ORIGIN=<your Frontend URL>` to restrict CORS

### 2. Client (Static Site)
- Create Static Site from this repo
- Root Directory: `client`
- Build Command: `npm run build`
- Publish Directory: `dist`
- Add env var `VITE_API_URL=https://<your-server>.onrender.com`

Deploy both. The frontend will call the backend using `VITE_API_URL`.

## Notes
- For larger apps, migrate from JSON file to a database (e.g., Postgres on Render).
- Keep `VITE_API_URL` updated for each environment.
- Both client and server have their own `package.json` and can be deployed independently.
