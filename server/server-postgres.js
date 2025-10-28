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

const FUTURE_FUNCTION_DEFAULTS = {
  name: "Nová funkce",
  priority: "Medium",
  complexity: "Moderate",
  phase: "Medium Term",
  info: "",
  status: "Planned"
};

const PALETTE_COLOR_KEYS = [
  "primary",
  "accent",
  "background",
  "surface",
  "text",
  "muted",
  "border"
];

const PALETTE_TYPOGRAPHY_KEYS = [
  "heading",
  "subheading",
  "body"
];

const DEFAULT_TYPOGRAPHY = {
  heading: "'Playfair Display', 'Times New Roman', serif",
  subheading: "'Poppins', 'Segoe UI', sans-serif",
  body: "'Inter', system-ui, sans-serif"
};

const DEFAULT_PALETTES = [
  {
    id: 1,
    name: "Walter Light",
    mode: "light",
    colors: {
      primary: "hsl(221, 83%, 55%)",
      accent: "hsl(172, 66%, 45%)",
      background: "hsl(210, 33%, 98%)",
      surface: "hsl(0, 0%, 100%)",
      text: "hsl(224, 33%, 16%)",
      muted: "hsl(220, 12%, 46%)",
      border: "hsl(214, 32%, 89%)"
    },
    typography: { ...DEFAULT_TYPOGRAPHY },
    is_active: true
  },
  {
    id: 2,
    name: "Walter Dark",
    mode: "dark",
    colors: {
      primary: "hsl(217, 86%, 65%)",
      accent: "hsl(162, 87%, 60%)",
      background: "hsl(222, 47%, 11%)",
      surface: "hsl(218, 39%, 14%)",
      text: "hsl(210, 40%, 96%)",
      muted: "hsl(215, 20%, 65%)",
      border: "hsl(220, 23%, 28%)"
    },
    typography: { ...DEFAULT_TYPOGRAPHY },
    is_active: true
  }
];

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
        const defaultData = { 
          partners: [], 
          clients: [], 
          tipers: [], 
          users: [], 
          employees: [], 
          futureFunctions: [],
          color_palettes: cloneDefaultPalettes()
        };
        fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2));
        console.log("Created empty data file");
      }
    } catch (e) {
      console.error("Failed to initialize data file:", e);
    }
  }
}

// CORS configuration - Allow multiple origins
const allowedOrigins = [
  'https://front-end-production-0ece.up.railway.app',
  'https://public-form-page-production.up.railway.app',
  process.env.ALLOWED_ORIGIN
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, Postman)
      if (!origin) return callback(null, true);
      
      // Check if origin is in allowed list
      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(null, true); // Allow all origins for now
      }
    },
    credentials: false
  })
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
  if (!obj.futureFunctions) obj.futureFunctions = [];
    if (!Array.isArray(obj.color_palettes)) obj.color_palettes = cloneDefaultPalettes();
    ensureFilePalettes(obj);
    return obj;
  } catch (e) {
    console.error("Error reading DB:", e);
    return { 
      partners: [], 
      clients: [], 
      tipers: [], 
      users: [], 
      employees: [], 
      futureFunctions: [],
      color_palettes: cloneDefaultPalettes()
    };
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

function cloneDefaultPalettes() {
  return DEFAULT_PALETTES.map(palette => ({
    ...palette,
    colors: { ...palette.colors },
    typography: { ...palette.typography }
  }));
}

function ensureFilePalettes(store) {
  if (!Array.isArray(store.color_palettes)) {
    store.color_palettes = cloneDefaultPalettes();
  }

  const palettes = store.color_palettes;
  let maxId = palettes.reduce((max, palette) => {
    const numericId = Number(palette.id) || 0;
    palette.id = numericId;
    return numericId > max ? numericId : max;
  }, 0);

  const seenIds = new Set();
  palettes.forEach(palette => {
    if (!palette.id || seenIds.has(palette.id)) {
      maxId += 1;
      palette.id = maxId;
    }
    seenIds.add(palette.id);

    palette.mode = palette.mode === 'dark' ? 'dark' : 'light';
    palette.is_active = Boolean(palette.is_active);

    if (!palette.colors || typeof palette.colors !== 'object') {
      palette.colors = {};
    }

    const fallback = DEFAULT_PALETTES.find(p => p.mode === palette.mode) ?? DEFAULT_PALETTES[0];
    for (const key of PALETTE_COLOR_KEYS) {
      const value = palette.colors[key];
      if (typeof value !== 'string' || !value.trim()) {
        palette.colors[key] = fallback.colors[key];
      } else {
        palette.colors[key] = value.trim();
      }
    }

    if (!palette.typography || typeof palette.typography !== 'object') {
      palette.typography = {};
    }

    for (const key of PALETTE_TYPOGRAPHY_KEYS) {
      const value = palette.typography[key];
      if (typeof value !== 'string' || !value.trim()) {
        palette.typography[key] = fallback.typography?.[key] ?? DEFAULT_TYPOGRAPHY[key];
      } else {
        palette.typography[key] = value.trim();
      }
    }
  });

  const modes = ['light', 'dark'];
  for (const mode of modes) {
    const modePalettes = palettes.filter(p => p.mode === mode);
    if (modePalettes.length === 0) {
      const fallback = cloneDefaultPalettes().find(p => p.mode === mode);
      if (fallback) {
        maxId += 1;
        fallback.id = maxId;
        palettes.push(fallback);
      }
      continue;
    }

    const activePalettes = modePalettes.filter(p => p.is_active);
    if (activePalettes.length === 0) {
      modePalettes[0].is_active = true;
    } else if (activePalettes.length > 1) {
      activePalettes.forEach((palette, index) => {
        palette.is_active = index === 0;
      });
    }
  }

  palettes.sort((a, b) => {
    const modeCompare = a.mode.localeCompare(b.mode);
    if (modeCompare !== 0) return modeCompare;
    return a.id - b.id;
  });
}

function getNextPaletteId(palettes) {
  return palettes.reduce((max, palette) => {
    const id = Number(palette.id) || 0;
    return id > max ? id : max;
  }, 0) + 1;
}

function sanitizePalettePayload(body, { partial = false, allowMode = true } = {}) {
  const errors = [];
  const payload = {};

  if (!partial || body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      errors.push('name');
    } else {
      payload.name = body.name.trim();
    }
  }

  if (allowMode && (!partial || body.mode !== undefined)) {
    if (body.mode !== 'light' && body.mode !== 'dark') {
      errors.push('mode');
    } else {
      payload.mode = body.mode;
    }
  }

  if (!partial || body.colors !== undefined) {
    if (typeof body.colors !== 'object' || body.colors === null) {
      errors.push('colors');
    } else {
      const colors = {};
      for (const key of PALETTE_COLOR_KEYS) {
        const value = body.colors[key];
        if (typeof value !== 'string' || !value.trim()) {
          errors.push(`colors.${key}`);
        } else {
          colors[key] = value.trim();
        }
      }
      if (Object.keys(colors).length === PALETTE_COLOR_KEYS.length) {
        payload.colors = colors;
      }
    }
  }

  if (!partial || body.typography !== undefined) {
    if (typeof body.typography !== 'object' || body.typography === null) {
      errors.push('typography');
    } else {
      const typography = {};
      for (const key of PALETTE_TYPOGRAPHY_KEYS) {
        const value = body.typography[key];
        if (typeof value !== 'string' || !value.trim()) {
          errors.push(`typography.${key}`);
        } else {
          typography[key] = value.trim();
        }
      }
      if (Object.keys(typography).length === PALETTE_TYPOGRAPHY_KEYS.length) {
        payload.typography = typography;
      }
    }
  }

  if (body.is_active !== undefined) {
    payload.is_active = Boolean(body.is_active);
  }

  return { payload, errors };
}

function setActivePaletteInStore(store, id) {
  const palette = store.color_palettes.find(p => p.id === id);
  if (!palette) {
    return null;
  }

  store.color_palettes.forEach(item => {
    if (item.mode === palette.mode) {
      item.is_active = item.id === palette.id;
    }
  });

  return palette;
}

function removePaletteFromStore(store, id) {
  const idx = store.color_palettes.findIndex(p => p.id === id);
  if (idx === -1) return null;
  const [removed] = store.color_palettes.splice(idx, 1);
  ensureFilePalettes(store);
  return removed;
}

// Color palette routes
app.get("/color-palettes", async (req, res) => {
  try {
    const mode = req.query.mode;
    if (mode && mode !== "light" && mode !== "dark") {
      return res.status(400).json({ error: "Invalid mode" });
    }

    if (db.isPostgres()) {
      const palettes = await db.getColorPalettes();
      const filtered = mode ? palettes.filter(p => p.mode === mode) : palettes;
      return res.json(filtered);
    }

    const dbData = readDb();
    const palettes = mode
      ? dbData.color_palettes.filter(p => p.mode === mode)
      : dbData.color_palettes;
    res.json(palettes);
  } catch (error) {
    console.error("Error fetching color palettes:", error);
    res.status(500).json({ error: "Failed to fetch color palettes" });
  }
});

app.get("/color-palettes/active", async (req, res) => {
  try {
    const mode = req.query.mode;
    if (mode && mode !== "light" && mode !== "dark") {
      return res.status(400).json({ error: "Invalid mode" });
    }

    if (db.isPostgres()) {
      if (mode) {
        const palette = await db.getActivePaletteByMode(mode);
        if (!palette) return res.status(404).json({ error: "Active palette not found" });
        return res.json(palette);
      }
      const palettes = await db.getActivePalettes();
      const response = {
        light: palettes.find(p => p.mode === "light") || null,
        dark: palettes.find(p => p.mode === "dark") || null
      };
      return res.json(response);
    }

    const dbData = readDb();
    if (mode) {
      const palette = dbData.color_palettes.find(p => p.mode === mode && p.is_active);
      if (!palette) return res.status(404).json({ error: "Active palette not found" });
      return res.json(palette);
    }

    const response = {
      light: dbData.color_palettes.find(p => p.mode === "light" && p.is_active) || null,
      dark: dbData.color_palettes.find(p => p.mode === "dark" && p.is_active) || null
    };
    res.json(response);
  } catch (error) {
    console.error("Error fetching active color palettes:", error);
    res.status(500).json({ error: "Failed to fetch active color palettes" });
  }
});

app.post("/color-palettes", async (req, res) => {
  try {
    const { payload, errors } = sanitizePalettePayload(req.body, { partial: false, allowMode: true });
    if (errors.length) {
      return res.status(400).json({ error: "Invalid payload", details: errors });
    }

    if (db.isPostgres()) {
      const created = await db.createColorPalette(payload);
      return res.status(201).json(created);
    }

    const dbData = readDb();
    const newId = getNextPaletteId(dbData.color_palettes);
    const newPalette = {
      id: newId,
      ...payload
    };

    if (newPalette.is_active) {
      dbData.color_palettes.forEach(palette => {
        if (palette.mode === newPalette.mode) {
          palette.is_active = false;
        }
      });
    }

    dbData.color_palettes.push(newPalette);
    ensureFilePalettes(dbData);

    if (!writeDb(dbData)) {
      return res.status(500).json({ error: "Failed to persist palette" });
    }

    const stored = dbData.color_palettes.find(p => p.id === newId) || newPalette;
    res.status(201).json(stored);
  } catch (error) {
    console.error("Error creating color palette:", error);
    res.status(500).json({ error: "Failed to create color palette" });
  }
});

app.put("/color-palettes/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: "Invalid id" });
    }

    const { payload, errors } = sanitizePalettePayload(req.body, { partial: true, allowMode: false });
    if (errors.length) {
      return res.status(400).json({ error: "Invalid payload", details: errors });
    }

    if (db.isPostgres()) {
      const updated = await db.updateColorPalette(id, payload);
      if (!updated) return res.status(404).json({ error: "Palette not found" });
      return res.json(updated);
    }

    const dbData = readDb();
    const palette = dbData.color_palettes.find(p => p.id === id);
    if (!palette) {
      return res.status(404).json({ error: "Palette not found" });
    }

    if (payload.name) palette.name = payload.name;
    if (payload.colors) palette.colors = payload.colors;
    if (payload.typography) palette.typography = payload.typography;
    if (payload.is_active !== undefined) {
      palette.is_active = payload.is_active;
      if (payload.is_active) {
        dbData.color_palettes.forEach(item => {
          if (item.mode === palette.mode && item.id !== palette.id) {
            item.is_active = false;
          }
        });
      }
    }

    ensureFilePalettes(dbData);

    if (!writeDb(dbData)) {
      return res.status(500).json({ error: "Failed to persist palette" });
    }

    res.json(palette);
  } catch (error) {
    console.error("Error updating color palette:", error);
    res.status(500).json({ error: "Failed to update color palette" });
  }
});

app.post("/color-palettes/:id/activate", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: "Invalid id" });
    }

    if (db.isPostgres()) {
      const activated = await db.activateColorPalette(id);
      if (!activated) return res.status(404).json({ error: "Palette not found" });
      return res.json(activated);
    }

    const dbData = readDb();
    const activated = setActivePaletteInStore(dbData, id);
    if (!activated) {
      return res.status(404).json({ error: "Palette not found" });
    }

    if (!writeDb(dbData)) {
      return res.status(500).json({ error: "Failed to persist palette" });
    }

    res.json(activated);
  } catch (error) {
    console.error("Error activating color palette:", error);
    res.status(500).json({ error: "Failed to activate color palette" });
  }
});

app.delete("/color-palettes/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: "Invalid id" });
    }

    if (db.isPostgres()) {
      const deleted = await db.deleteColorPalette(id);
      if (!deleted) return res.status(404).json({ error: "Palette not found" });
      return res.json(deleted);
    }

    const dbData = readDb();
    const removed = removePaletteFromStore(dbData, id);
    if (!removed) {
      return res.status(404).json({ error: "Palette not found" });
    }

    if (!writeDb(dbData)) {
      return res.status(500).json({ error: "Failed to persist palette" });
    }

    res.json(removed);
  } catch (error) {
    console.error("Error deleting color palette:", error);
    res.status(500).json({ error: "Failed to delete color palette" });
  }
});

// Generic CRUD route handler factory
function createCrudRoutes(tableName) {
  // GET all (with optional status filter)
  app.get(`/${tableName}`, async (req, res) => {
    try {
      const status = req.query.status;
      
      if (db.isPostgres()) {
        const filters = status ? { status } : {};
        const records = await db.getAll(tableName, filters);
        res.json(records);
      } else {
        const dbData = readDb();
        let records = dbData[tableName] || [];
        if (status) {
          records = records.filter(r => r.status === status);
        }
        res.json(records);
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

  // POST (create) - defaults to pending status
  app.post(`/${tableName}`, async (req, res) => {
    try {
      const data = req.body || {};
      // Default status is 'pending' if not specified
      if (!data.status) {
        data.status = 'pending';
      }
      
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

  // APPROVE - Change status from pending to accepted
  app.post(`/${tableName}/:id/approve`, async (req, res) => {
    try {
      const id = Number(req.params.id);
      
      if (db.isPostgres()) {
        const approved = await db.approve(tableName, id);
        if (!approved) return res.status(404).json({ error: "Not found" });
        res.json(approved);
      } else {
        const dbData = readDb();
        const idx = dbData[tableName].findIndex(r => r.id === id);
        if (idx === -1) return res.status(404).json({ error: "Not found" });
        dbData[tableName][idx] = { ...dbData[tableName][idx], status: 'accepted' };
        if (!writeDb(dbData)) return res.status(500).json({ error: "Failed to persist" });
        res.json(dbData[tableName][idx]);
      }
    } catch (error) {
      console.error(`Error approving ${tableName}:`, error);
      res.status(500).json({ error: "Failed to approve record" });
    }
  });

  // ARCHIVE - Change status to archived (mark for removal)
  app.post(`/${tableName}/:id/archive`, async (req, res) => {
    try {
      const id = Number(req.params.id);

      if (db.isPostgres()) {
        const archived = await db.archive(tableName, id);
        if (!archived) return res.status(404).json({ error: "Not found" });
        res.json(archived);
      } else {
        const dbData = readDb();
        const idx = dbData[tableName].findIndex(r => r.id === id);
        if (idx === -1) return res.status(404).json({ error: "Not found" });
        dbData[tableName][idx] = { ...dbData[tableName][idx], status: 'archived' };
        if (!writeDb(dbData)) return res.status(500).json({ error: "Failed to persist" });
        res.json(dbData[tableName][idx]);
      }
    } catch (error) {
      console.error(`Error archiving ${tableName}:`, error);
      res.status(500).json({ error: "Failed to archive record" });
    }
  });

  // RESTORE - Change status from archived back to accepted
  app.post(`/${tableName}/:id/restore`, async (req, res) => {
    try {
      const id = Number(req.params.id);

      if (db.isPostgres()) {
        const restored = await db.restore(tableName, id);
        if (!restored) return res.status(404).json({ error: "Not found" });
        res.json(restored);
      } else {
        const dbData = readDb();
        const idx = dbData[tableName].findIndex(r => r.id === id);
        if (idx === -1) return res.status(404).json({ error: "Not found" });
        dbData[tableName][idx] = { ...dbData[tableName][idx], status: 'accepted' };
        if (!writeDb(dbData)) return res.status(500).json({ error: "Failed to persist" });
        res.json(dbData[tableName][idx]);
      }
    } catch (error) {
      console.error(`Error restoring ${tableName}:`, error);
      res.status(500).json({ error: "Failed to restore record" });
    }
  });
}

function createFutureFunctionsRoutes() {
  const tableName = 'future_functions';

  app.get('/future-functions', async (req, res) => {
    try {
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;

      if (db.isPostgres()) {
        const filters = status ? { status } : {};
        const records = await db.getAll(tableName, filters);
        return res.json(records);
      }

      const store = readDb();
      let records = store.futureFunctions ?? [];
      if (status) {
        records = records.filter((record) => record.status === status);
      }
      res.json(records);
    } catch (error) {
      console.error('Error fetching future functions:', error);
      res.status(500).json({ error: 'Failed to fetch future functions' });
    }
  });

  app.post('/future-functions', async (req, res) => {
    try {
      const payload = { ...FUTURE_FUNCTION_DEFAULTS, ...(req.body ?? {}) };

      if (db.isPostgres()) {
        const created = await db.create(tableName, payload);
        return res.status(201).json(created);
      }

      const store = readDb();
      const maxId = store.futureFunctions.reduce((max, item) => (item.id > max ? item.id : max), 0);
      const entry = { id: maxId + 1, ...payload };
      store.futureFunctions.push(entry);
      if (!writeDb(store)) {
        return res.status(500).json({ error: 'Failed to persist' });
      }
      res.status(201).json(entry);
    } catch (error) {
      console.error('Error creating future function:', error);
      res.status(500).json({ error: 'Failed to create future function' });
    }
  });

  app.put('/future-functions/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const payload = { ...FUTURE_FUNCTION_DEFAULTS, ...(req.body ?? {}) };

      if (db.isPostgres()) {
        const updated = await db.update(tableName, id, payload);
        if (!updated) {
          return res.status(404).json({ error: 'Not found' });
        }
        return res.json(updated);
      }

      const store = readDb();
      const idx = store.futureFunctions.findIndex((record) => record.id === id);
      if (idx === -1) {
        return res.status(404).json({ error: 'Not found' });
      }
      store.futureFunctions[idx] = { ...store.futureFunctions[idx], ...payload, id };
      if (!writeDb(store)) {
        return res.status(500).json({ error: 'Failed to persist' });
      }
      res.json(store.futureFunctions[idx]);
    } catch (error) {
      console.error('Error updating future function:', error);
      res.status(500).json({ error: 'Failed to update future function' });
    }
  });

  app.patch('/future-functions/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const patch = req.body ?? {};

      if (db.isPostgres()) {
        const updated = await db.update(tableName, id, patch);
        if (!updated) {
          return res.status(404).json({ error: 'Not found' });
        }
        return res.json(updated);
      }

      const store = readDb();
      const idx = store.futureFunctions.findIndex((record) => record.id === id);
      if (idx === -1) {
        return res.status(404).json({ error: 'Not found' });
      }
      store.futureFunctions[idx] = { ...store.futureFunctions[idx], ...patch, id };
      if (!writeDb(store)) {
        return res.status(500).json({ error: 'Failed to persist' });
      }
      res.json(store.futureFunctions[idx]);
    } catch (error) {
      console.error('Error patching future function:', error);
      res.status(500).json({ error: 'Failed to patch future function' });
    }
  });

  app.delete('/future-functions/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);

      if (db.isPostgres()) {
        const deleted = await db.delete(tableName, id);
        if (!deleted) {
          return res.status(404).json({ error: 'Not found' });
        }
        return res.status(204).end();
      }

      const store = readDb();
      const before = store.futureFunctions.length;
      store.futureFunctions = store.futureFunctions.filter((record) => record.id !== id);
      if (before === store.futureFunctions.length) {
        return res.status(404).json({ error: 'Not found' });
      }
      if (!writeDb(store)) {
        return res.status(500).json({ error: 'Failed to persist' });
      }
      res.status(204).end();
    } catch (error) {
      console.error('Error deleting future function:', error);
      res.status(500).json({ error: 'Failed to delete future function' });
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
createFutureFunctionsRoutes();

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
