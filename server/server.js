import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import {
  initializeDatabase,
  getAllPartners,
  getPartnerById,
  createPartner,
  updatePartner,
  deletePartner,
  migrateJsonData
} from "./database.js";

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3004;

// Initialize database on startup
initializeDatabase().then(async () => {
  // Auto-migrate data from JSON file if it exists and database is empty
  try {
    const partners = await getAllPartners();
    if (partners.length === 0 && fs.existsSync(SEED_FILE)) {
      console.log('Database is empty, migrating from JSON file...');
      const jsonData = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
      await migrateJsonData(jsonData);
      console.log('Migration completed successfully');
    }
  } catch (error) {
    console.log('Migration skipped or failed:', error.message);
  }
});

// Legacy file-based system for fallback/migration
const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "db.json");
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
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
app.use(
  cors({
    origin: ALLOWED_ORIGIN === "*" ? true : ALLOWED_ORIGIN,
    credentials: false
  })
);
app.use(express.json());

function readDb() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const obj = JSON.parse(raw || "{}");
    if (!obj.partners) obj.partners = [];
    if (!obj.clients) obj.clients = [];
    if (!obj.tipers) obj.tipers = [];
    // Keep backwards compatibility
    if (!obj.users) obj.users = [];
    if (!obj.employees) obj.employees = [];
    return obj;
  } catch (e) {
    console.error("Error reading DB:", e);
    return { partners: [], clients: [], tipers: [], users: [], employees: [] };
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

// Migration endpoint
app.post("/migrate", async (req, res) => {
  try {
    const jsonData = req.body;
    await migrateJsonData(jsonData);
    res.json({ message: "Migration completed successfully" });
  } catch (error) {
    console.error("Migration error:", error);
    res.status(500).json({ error: "Migration failed" });
  }
});

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

// CRUD for partners (PostgreSQL)
app.get("/partners", async (_req, res) => {
  try {
    const partners = await getAllPartners();
    res.json(partners);
  } catch (error) {
    console.error("Error fetching partners:", error);
    res.status(500).json({ error: "Failed to fetch partners" });
  }
});

app.post("/partners", async (req, res) => {
  try {
    const partner = await createPartner(req.body);
    res.status(201).json(partner);
  } catch (error) {
    console.error("Error creating partner:", error);
    res.status(500).json({ error: "Failed to create partner" });
  }
});

app.put("/partners/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const partner = await updatePartner(id, req.body);
    if (!partner) {
      return res.status(404).json({ error: "Partner not found" });
    }
    res.json(partner);
  } catch (error) {
    console.error("Error updating partner:", error);
    res.status(500).json({ error: "Failed to update partner" });
  }
});

app.patch("/partners/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const existingPartner = await getPartnerById(id);
    if (!existingPartner) {
      return res.status(404).json({ error: "Partner not found" });
    }
    const updatedData = { ...existingPartner, ...req.body };
    const partner = await updatePartner(id, updatedData);
    res.json(partner);
  } catch (error) {
    console.error("Error updating partner:", error);
    res.status(500).json({ error: "Failed to update partner" });
  }
});

app.delete("/partners/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await deletePartner(id);
    res.status(204).end();
  } catch (error) {
    console.error("Error deleting partner:", error);
    res.status(500).json({ error: "Failed to delete partner" });
  }
});

// CRUD for employees
app.get("/employees", (_req, res) => {
  const db = readDb();
  res.json(db.employees);
});

app.post("/employees", (req, res) => {
  const db = readDb();
  const employee = req.body || {};
  // Simple id assignment (max + 1)
  const maxId = db.employees.reduce((m, e) => (e.id > m ? e.id : m), 0);
  const nextId = maxId + 1;
  const newEmployee = { id: nextId, ...employee };
  db.employees.push(newEmployee);
  if (!writeDb(db)) return res.status(500).json({ error: "Failed to persist" });
  res.status(201).json(newEmployee);
});

app.put("/employees/:id", (req, res) => {
  const id = Number(req.params.id);
  const db = readDb();
  const idx = db.employees.findIndex((e) => e.id === id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  const updated = { ...req.body, id };
  db.employees[idx] = updated;
  if (!writeDb(db)) return res.status(500).json({ error: "Failed to persist" });
  res.json(updated);
});

app.patch("/employees/:id", (req, res) => {
  const id = Number(req.params.id);
  const db = readDb();
  const idx = db.employees.findIndex((e) => e.id === id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  db.employees[idx] = { ...db.employees[idx], ...req.body, id };
  if (!writeDb(db)) return res.status(500).json({ error: "Failed to persist" });
  res.json(db.employees[idx]);
});

app.delete("/employees/:id", (req, res) => {
  const id = Number(req.params.id);
  const db = readDb();
  const before = db.employees.length;
  db.employees = db.employees.filter((e) => e.id !== id);
  if (db.employees.length === before) return res.status(404).json({ error: "Not found" });
  if (!writeDb(db)) return res.status(500).json({ error: "Failed to persist" });
  res.status(204).end();
});

// CRUD for clients
app.get("/clients", (_req, res) => {
  const db = readDb();
  res.json(db.clients);
});

app.post("/clients", (req, res) => {
  const db = readDb();
  const client = req.body || {};
  const maxId = db.clients.reduce((m, c) => (c.id > m ? c.id : m), 0);
  const nextId = maxId + 1;
  const newClient = { id: nextId, ...client };
  db.clients.push(newClient);
  if (!writeDb(db)) return res.status(500).json({ error: "Failed to persist" });
  res.status(201).json(newClient);
});

app.put("/clients/:id", (req, res) => {
  const id = Number(req.params.id);
  const db = readDb();
  const idx = db.clients.findIndex((c) => c.id === id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  const updated = { ...req.body, id };
  db.clients[idx] = updated;
  if (!writeDb(db)) return res.status(500).json({ error: "Failed to persist" });
  res.json(updated);
});

app.patch("/clients/:id", (req, res) => {
  const id = Number(req.params.id);
  const db = readDb();
  const idx = db.clients.findIndex((c) => c.id === id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  db.clients[idx] = { ...db.clients[idx], ...req.body, id };
  if (!writeDb(db)) return res.status(500).json({ error: "Failed to persist" });
  res.json(db.clients[idx]);
});

app.delete("/clients/:id", (req, res) => {
  const id = Number(req.params.id);
  const db = readDb();
  const before = db.clients.length;
  db.clients = db.clients.filter((c) => c.id !== id);
  if (db.clients.length === before) return res.status(404).json({ error: "Not found" });
  if (!writeDb(db)) return res.status(500).json({ error: "Failed to persist" });
  res.status(204).end();
});

// CRUD for tipers
app.get("/tipers", (_req, res) => {
  const db = readDb();
  res.json(db.tipers);
});

app.post("/tipers", (req, res) => {
  const db = readDb();
  const tiper = req.body || {};
  const maxId = db.tipers.reduce((m, t) => (t.id > m ? t.id : m), 0);
  const nextId = maxId + 1;
  const newTiper = { id: nextId, ...tiper };
  db.tipers.push(newTiper);
  if (!writeDb(db)) return res.status(500).json({ error: "Failed to persist" });
  res.status(201).json(newTiper);
});

app.put("/tipers/:id", (req, res) => {
  const id = Number(req.params.id);
  const db = readDb();
  const idx = db.tipers.findIndex((t) => t.id === id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  const updated = { ...req.body, id };
  db.tipers[idx] = updated;
  if (!writeDb(db)) return res.status(500).json({ error: "Failed to persist" });
  res.json(updated);
});

app.patch("/tipers/:id", (req, res) => {
  const id = Number(req.params.id);
  const db = readDb();
  const idx = db.tipers.findIndex((t) => t.id === id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  db.tipers[idx] = { ...db.tipers[idx], ...req.body, id };
  if (!writeDb(db)) return res.status(500).json({ error: "Failed to persist" });
  res.json(db.tipers[idx]);
});

app.delete("/tipers/:id", (req, res) => {
  const id = Number(req.params.id);
  const db = readDb();
  const before = db.tipers.length;
  db.tipers = db.tipers.filter((t) => t.id !== id);
  if (db.tipers.length === before) return res.status(404).json({ error: "Not found" });
  if (!writeDb(db)) return res.status(500).json({ error: "Failed to persist" });
  res.status(204).end();
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`API listening on http://0.0.0.0:${PORT}`);
  console.log(`Data file: ${DATA_FILE}`);
});
