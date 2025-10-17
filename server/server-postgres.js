import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import db, { initDatabase } from "./db.js";

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3004;

// File-based storage (development mode)
const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "db.json");
const SEED_FILE = process.env.SEED_FILE || path.resolve(process.cwd(), "db.json");

// Initialize database
if (db.isPostgres()) {
  await initDatabase();
} else {
  // Ensure data directory exists for file-based storage
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
        const defaultData = { partners: [], clients: [], tipers: [], users: [], employees: [] };
        fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2));
        console.log("Created empty data file");
      }
    } catch (e) {
      console.error("Failed to initialize data file:", e);
    }
  }
}

// CORS configuration
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;
app.use(
  cors(
    ALLOWED_ORIGIN
      ? { origin: ALLOWED_ORIGIN, credentials: false }
      : { origin: true, credentials: false }
  )
);
app.use(express.json());

// File-based database functions (development mode)
function readDb() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const obj = JSON.parse(raw || "{}");
    if (!obj.partners) obj.partners = [];
    if (!obj.clients) obj.clients = [];
    if (!obj.tipers) obj.tipers = [];
    if (!obj.users) obj.users = [];
    if (!obj.employees) obj.employees = [];
    return obj;
  } catch (e) {
    console.error("Error reading DB:", e);
    return { partners: [], clients: [], tipers: [], users: [], employees: [] };
  }
}

function writeDb(dbData) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(dbData, null, 2), "utf8");
    return true;
  } catch (e) {
    console.error("Error writing DB:", e);
    return false;
  }
}

// Generic CRUD route handler factory
function createCrudRoutes(tableName) {
  // GET all
  app.get(`/${tableName}`, async (_req, res) => {
    try {
      if (db.isPostgres()) {
        const records = await db.getAll(tableName);
        res.json(records);
      } else {
        const dbData = readDb();
        res.json(dbData[tableName] || []);
      }
    } catch (error) {
      console.error(`Error fetching ${tableName}:`, error);
      res.status(500).json({ error: "Failed to fetch records" });
    }
  });

  // GET by ID
  app.get(`/${tableName}/:id`, async (req, res) => {
    try {
      const id = Number(req.params.id);
      
      if (db.isPostgres()) {
        const record = await db.getById(tableName, id);
        if (!record) return res.status(404).json({ error: "Not found" });
        res.json(record);
      } else {
        const dbData = readDb();
        const record = dbData[tableName]?.find(r => r.id === id);
        if (!record) return res.status(404).json({ error: "Not found" });
        res.json(record);
      }
    } catch (error) {
      console.error(`Error fetching ${tableName} by id:`, error);
      res.status(500).json({ error: "Failed to fetch record" });
    }
  });

  // POST (create)
  app.post(`/${tableName}`, async (req, res) => {
    try {
      const data = req.body || {};
      
      if (db.isPostgres()) {
        const newRecord = await db.create(tableName, data);
        res.status(201).json(newRecord);
      } else {
        const dbData = readDb();
        const maxId = dbData[tableName].reduce((m, r) => (r.id > m ? r.id : m), 0);
        const newRecord = { id: maxId + 1, ...data };
        dbData[tableName].push(newRecord);
        if (!writeDb(dbData)) return res.status(500).json({ error: "Failed to persist" });
        res.status(201).json(newRecord);
      }
    } catch (error) {
      console.error(`Error creating ${tableName}:`, error);
      res.status(500).json({ error: "Failed to create record" });
    }
  });

  // PUT (update)
  app.put(`/${tableName}/:id`, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const data = req.body || {};
      
      if (db.isPostgres()) {
        const updated = await db.update(tableName, id, data);
        if (!updated) return res.status(404).json({ error: "Not found" });
        res.json(updated);
      } else {
        const dbData = readDb();
        const idx = dbData[tableName].findIndex(r => r.id === id);
        if (idx === -1) return res.status(404).json({ error: "Not found" });
        dbData[tableName][idx] = { ...dbData[tableName][idx], ...data, id };
        if (!writeDb(dbData)) return res.status(500).json({ error: "Failed to persist" });
        res.json(dbData[tableName][idx]);
      }
    } catch (error) {
      console.error(`Error updating ${tableName}:`, error);
      res.status(500).json({ error: "Failed to update record" });
    }
  });

  // DELETE
  app.delete(`/${tableName}/:id`, async (req, res) => {
    try {
      const id = Number(req.params.id);
      
      if (db.isPostgres()) {
        const deleted = await db.delete(tableName, id);
        if (!deleted) return res.status(404).json({ error: "Not found" });
        res.json(deleted);
      } else {
        const dbData = readDb();
        const idx = dbData[tableName].findIndex(r => r.id === id);
        if (idx === -1) return res.status(404).json({ error: "Not found" });
        const [deleted] = dbData[tableName].splice(idx, 1);
        if (!writeDb(dbData)) return res.status(500).json({ error: "Failed to persist" });
        res.json(deleted);
      }
    } catch (error) {
      console.error(`Error deleting ${tableName}:`, error);
      res.status(500).json({ error: "Failed to delete record" });
    }
  });
}

// Health check
app.get("/health", (_req, res) => {
  res.json({ 
    ok: true, 
    database: db.isPostgres() ? 'postgresql' : 'json-file',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Create CRUD routes for all tables
createCrudRoutes('partners');
createCrudRoutes('clients');
createCrudRoutes('tipers');
createCrudRoutes('users');
createCrudRoutes('employees');

// Start server
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   Walter System Server Running         ║
╠════════════════════════════════════════╣
║  Port: ${PORT}                        
║  Database: ${db.isPostgres() ? 'PostgreSQL' : 'JSON File'}              
║  Environment: ${process.env.NODE_ENV || 'development'}           
╚════════════════════════════════════════╝
  `);
});
