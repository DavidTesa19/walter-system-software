import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3004;
// For free tier: use /tmp (temporary) or current directory
const DATA_DIR = process.env.DATA_DIR || "/tmp";
const DATA_FILE = path.join(DATA_DIR, "db.json");
// Use the db.json co-located with this server by default
const SEED_FILE = process.env.SEED_FILE || path.resolve(process.cwd(), "db.json");

// Ensure data directory exists
try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
} catch (e) {
  console.warn("Could not create data directory:", e.message);
}

// Seed data file on first run if missing
if (!fs.existsSync(DATA_FILE)) {
  try {
    if (fs.existsSync(SEED_FILE)) {
      fs.copyFileSync(SEED_FILE, DATA_FILE);
      console.log("Seeded data from:", SEED_FILE);
    } else {
      const defaultData = { users: [] };
      fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2));
      console.log("Created empty data file");
    }
  } catch (e) {
    console.error("Failed to initialize data file:", e);
  }
}

// CORS: allow specific origin if provided, otherwise allow all (useful for local dev)
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;
app.use(
  cors(
    ALLOWED_ORIGIN
      ? { origin: ALLOWED_ORIGIN, credentials: false }
      : { origin: true, credentials: false }
  )
);
app.use(express.json());

function readDb() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const obj = JSON.parse(raw || "{}");
    if (!obj.users) obj.users = [];
    return obj;
  } catch (e) {
    console.error("Error reading DB:", e);
    return { users: [] };
  }
}

function writeDb(db) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), "utf8");
    return true;
  } catch (e) {
    console.error("Error writing DB:", e);
    return false;
  }
}

// Routes
app.get("/health", (_req, res) => res.json({ ok: true }));

// CRUD for users
app.get("/users", (_req, res) => {
  const db = readDb();
  res.json(db.users);
});

app.post("/users", (req, res) => {
  const db = readDb();
  const user = req.body || {};
  // Simple id assignment (max + 1)
  const maxId = db.users.reduce((m, u) => (u.id > m ? u.id : m), 0);
  const nextId = maxId + 1;
  const newUser = { id: nextId, ...user };
  db.users.push(newUser);
  if (!writeDb(db)) return res.status(500).json({ error: "Failed to persist" });
  res.status(201).json(newUser);
});

app.put("/users/:id", (req, res) => {
  const id = Number(req.params.id);
  const db = readDb();
  const idx = db.users.findIndex((u) => u.id === id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  const updated = { ...req.body, id };
  db.users[idx] = updated;
  if (!writeDb(db)) return res.status(500).json({ error: "Failed to persist" });
  res.json(updated);
});

app.patch("/users/:id", (req, res) => {
  const id = Number(req.params.id);
  const db = readDb();
  const idx = db.users.findIndex((u) => u.id === id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  db.users[idx] = { ...db.users[idx], ...req.body, id };
  if (!writeDb(db)) return res.status(500).json({ error: "Failed to persist" });
  res.json(db.users[idx]);
});

app.delete("/users/:id", (req, res) => {
  const id = Number(req.params.id);
  const db = readDb();
  const before = db.users.length;
  db.users = db.users.filter((u) => u.id !== id);
  if (db.users.length === before) return res.status(404).json({ error: "Not found" });
  if (!writeDb(db)) return res.status(500).json({ error: "Failed to persist" });
  res.status(204).end();
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`API listening on http://0.0.0.0:${PORT}`);
  console.log(`Data file: ${DATA_FILE}`);
});
