import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";

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

const DEFAULT_COLOR_PALETTES = [
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

const cloneDefaultPalettes = () => DEFAULT_COLOR_PALETTES.map(palette => ({
  ...palette,
  colors: { ...palette.colors },
  typography: { ...palette.typography }
}));

const ensurePalettes = db => {
  let mutated = false;
  if (!Array.isArray(db.color_palettes)) {
    db.color_palettes = cloneDefaultPalettes();
    mutated = true;
  }

  const modes = ["light", "dark"];
  let nextId = db.color_palettes.reduce((max, palette) => (palette.id > max ? palette.id : max), 0);

  for (const mode of modes) {
    const modePalettes = db.color_palettes.filter(palette => palette.mode === mode);
    if (modePalettes.length === 0) {
      const fallback = cloneDefaultPalettes().find(palette => palette.mode === mode);
      if (fallback) {
        nextId += 1;
        fallback.id = nextId;
        db.color_palettes.push(fallback);
        mutated = true;
      }
      continue;
    }

    const activePalettes = modePalettes.filter(palette => palette.is_active);
    if (activePalettes.length === 0) {
      modePalettes[0].is_active = true;
      mutated = true;
    } else if (activePalettes.length > 1) {
      activePalettes.forEach((palette, index) => {
        palette.is_active = index === 0;
      });
      mutated = true;
    }

    modePalettes.forEach(palette => {
      if (!palette.colors || typeof palette.colors !== "object") {
        palette.colors = {};
      }

      const fallback = DEFAULT_COLOR_PALETTES.find(item => item.mode === palette.mode) ?? DEFAULT_COLOR_PALETTES[0];
      for (const key of PALETTE_COLOR_KEYS) {
        const value = palette.colors[key];
        if (typeof value !== "string" || !value.trim()) {
          palette.colors[key] = fallback.colors[key];
          mutated = true;
        } else {
          palette.colors[key] = value.trim();
        }
      }

      if (!palette.typography || typeof palette.typography !== "object") {
        palette.typography = {};
      }

      for (const key of PALETTE_TYPOGRAPHY_KEYS) {
        const value = palette.typography[key];
        if (typeof value !== "string" || !value.trim()) {
          const fallbackFont = fallback.typography?.[key] ?? DEFAULT_TYPOGRAPHY[key];
          palette.typography[key] = fallbackFont;
          mutated = true;
        } else {
          palette.typography[key] = value.trim();
        }
      }
    });
  }

  return mutated;
};

const sanitizePalettePayload = (body, { partial = false, allowMode = true } = {}) => {
  const errors = [];
  const payload = {};

  if (!partial || body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      errors.push("name");
    } else {
      payload.name = body.name.trim();
    }
  }

  if (allowMode && (!partial || body.mode !== undefined)) {
    if (body.mode !== "light" && body.mode !== "dark") {
      errors.push("mode");
    } else {
      payload.mode = body.mode;
    }
  }

  if (!partial || body.colors !== undefined) {
    if (typeof body.colors !== "object" || body.colors === null) {
      errors.push("colors");
    } else {
      const colors = {};
      for (const key of PALETTE_COLOR_KEYS) {
        const value = body.colors[key];
        if (typeof value !== "string" || !value.trim()) {
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
    if (typeof body.typography !== "object" || body.typography === null) {
      errors.push("typography");
    } else {
      const typography = {};
      for (const key of PALETTE_TYPOGRAPHY_KEYS) {
        const value = body.typography[key];
        if (typeof value !== "string" || !value.trim()) {
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
};

const getNextPaletteId = palettes => palettes.reduce((max, palette) => (
  typeof palette.id === "number" && palette.id > max ? palette.id : max
), 0) + 1;

const setActivePalette = (palettes, id) => {
  const palette = palettes.find(item => item.id === id);
  if (!palette) return null;
  palettes.forEach(item => {
    if (item.mode === palette.mode) {
      item.is_active = item.id === palette.id;
    }
  });
  return palette;
};

const removePalette = (palettes, id) => {
  const index = palettes.findIndex(item => item.id === id);
  if (index === -1) return null;
  const [removed] = palettes.splice(index, 1);
  return removed;
};

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3004;
// For free tier: use temp directory or current directory
const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "db.json");
// Use the db.json co-located with this server by default
const SEED_FILE = process.env.SEED_FILE || path.resolve(process.cwd(), "db.json");

const FUTURE_FUNCTION_DEFAULTS = {
  name: "Nová funkce",
  priority: "Medium",
  complexity: "Moderate",
  phase: "Medium Term",
  info: "",
  status: "Planned"
};

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
      const defaultData = {
        users: [],
        partners: [],
        clients: [],
        tipers: [],
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

// CORS: allow specific origin if provided, otherwise allow all (useful for local dev)
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;
app.use(
  cors({
    origin: true, // Allow all origins in development
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
  if (!obj.futureFunctions) obj.futureFunctions = [];
    // Keep backwards compatibility
    if (!obj.users) obj.users = [];
    if (!obj.employees) obj.employees = [];
    const mutated = ensurePalettes(obj);
    if (mutated) {
      writeDb(obj);
    }
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

// CRUD for partners
app.get("/partners", (req, res) => {
  const db = readDb();
  const status = req.query.status;
  if (status) {
    res.json(db.partners.filter(p => p.status === status));
  } else {
    res.json(db.partners);
  }
});

app.post("/partners", (req, res) => {
  const db = readDb();
  const partner = req.body || {};
  const maxId = db.partners.reduce((m, p) => (p.id > m ? p.id : m), 0);
  const nextId = maxId + 1;
  // Default status is 'pending' if not specified, or use the provided status
  const newPartner = { id: nextId, status: 'pending', ...partner };
  db.partners.push(newPartner);
  if (!writeDb(db)) return res.status(500).json({ error: "Failed to persist" });
  res.status(201).json(newPartner);
});

app.put("/partners/:id", (req, res) => {
  const id = Number(req.params.id);
  const db = readDb();
  const idx = db.partners.findIndex((p) => p.id === id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  const updated = { ...req.body, id };
  db.partners[idx] = updated;
  if (!writeDb(db)) return res.status(500).json({ error: "Failed to persist" });
  res.json(updated);
});

app.patch("/partners/:id", (req, res) => {
  const id = Number(req.params.id);
  const db = readDb();
  const idx = db.partners.findIndex((p) => p.id === id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  db.partners[idx] = { ...db.partners[idx], ...req.body, id };
  if (!writeDb(db)) return res.status(500).json({ error: "Failed to persist" });
  res.json(db.partners[idx]);
});

app.delete("/partners/:id", (req, res) => {
  const id = Number(req.params.id);
  const db = readDb();
  const before = db.partners.length;
  db.partners = db.partners.filter((p) => p.id !== id);
  if (db.partners.length === before) return res.status(404).json({ error: "Not found" });
  if (!writeDb(db)) return res.status(500).json({ error: "Failed to persist" });
  res.status(204).end();
});

// Approve partner (change status from pending to accepted)
app.post("/partners/:id/approve", (req, res) => {
  const id = Number(req.params.id);
  const db = readDb();
  const idx = db.partners.findIndex((p) => p.id === id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  db.partners[idx] = { ...db.partners[idx], status: "accepted" };
  if (!writeDb(db)) return res.status(500).json({ error: "Failed to persist" });
  res.json(db.partners[idx]);
});

// Archive partner (change status to archived for removal approval)
app.post("/partners/:id/archive", (req, res) => {
  const id = Number(req.params.id);
  const db = readDb();
  const idx = db.partners.findIndex((p) => p.id === id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  db.partners[idx] = { ...db.partners[idx], status: "archived" };
  if (!writeDb(db)) return res.status(500).json({ error: "Failed to persist" });
  res.json(db.partners[idx]);
});

// Color palette routes for local JSON storage
app.get("/color-palettes", (req, res) => {
  const mode = req.query.mode;
  if (mode && mode !== "light" && mode !== "dark") {
    return res.status(400).json({ error: "Invalid mode" });
  }

  const db = readDb();
  const palettes = mode
    ? db.color_palettes.filter(palette => palette.mode === mode)
    : db.color_palettes;
  res.json(palettes);
});

app.get("/color-palettes/active", (req, res) => {
  const mode = req.query.mode;
  if (mode && mode !== "light" && mode !== "dark") {
    return res.status(400).json({ error: "Invalid mode" });
  }

  const db = readDb();

  if (mode) {
    const palette = db.color_palettes.find(item => item.mode === mode && item.is_active);
    if (!palette) {
      return res.status(404).json({ error: "Active palette not found" });
    }
    return res.json(palette);
  }

  const response = {
    light: db.color_palettes.find(item => item.mode === "light" && item.is_active) || null,
    dark: db.color_palettes.find(item => item.mode === "dark" && item.is_active) || null
  };

  res.json(response);
});

app.post("/color-palettes", (req, res) => {
  const { payload, errors } = sanitizePalettePayload(req.body, { partial: false, allowMode: true });
  if (errors.length) {
    return res.status(400).json({ error: "Invalid payload", details: errors });
  }

  const db = readDb();
  const id = getNextPaletteId(db.color_palettes);
  const newPalette = {
    id,
    ...payload,
    is_active: Boolean(payload.is_active)
  };

  if (newPalette.is_active) {
    db.color_palettes.forEach(item => {
      if (item.mode === newPalette.mode) {
        item.is_active = false;
      }
    });
  }

  db.color_palettes.push(newPalette);

  if (newPalette.is_active) {
    setActivePalette(db.color_palettes, newPalette.id);
  }

  ensurePalettes(db);

  if (!writeDb(db)) {
    return res.status(500).json({ error: "Failed to persist palette" });
  }

  res.status(201).json(newPalette);
});

app.put("/color-palettes/:id", (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid palette id" });
  }

  const { payload, errors } = sanitizePalettePayload(req.body, { partial: true, allowMode: false });
  if (errors.length) {
    return res.status(400).json({ error: "Invalid payload", details: errors });
  }

  const db = readDb();
  const idx = db.color_palettes.findIndex(palette => palette.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: "Palette not found" });
  }

  const updated = {
    ...db.color_palettes[idx],
    ...payload
  };

  db.color_palettes[idx] = updated;

  if (payload.is_active) {
    setActivePalette(db.color_palettes, id);
  }

  ensurePalettes(db);

  if (!writeDb(db)) {
    return res.status(500).json({ error: "Failed to persist palette" });
  }

  res.json(updated);
});

app.delete("/color-palettes/:id", (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid palette id" });
  }

  const db = readDb();
  const removed = removePalette(db.color_palettes, id);
  if (!removed) {
    return res.status(404).json({ error: "Palette not found" });
  }

  ensurePalettes(db);

  if (!writeDb(db)) {
    return res.status(500).json({ error: "Failed to persist palette" });
  }

  res.status(204).end();
});

app.post("/color-palettes/:id/activate", (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid palette id" });
  }

  const db = readDb();
  const activated = setActivePalette(db.color_palettes, id);
  if (!activated) {
    return res.status(404).json({ error: "Palette not found" });
  }

  ensurePalettes(db);

  if (!writeDb(db)) {
    return res.status(500).json({ error: "Failed to persist palette activation" });
  }

  res.json(activated);
});

// Restore partner from archive (change status back to accepted)
app.post("/partners/:id/restore", (req, res) => {
  const id = Number(req.params.id);
  const db = readDb();
  const idx = db.partners.findIndex((p) => p.id === id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  db.partners[idx] = { ...db.partners[idx], status: "accepted" };
  if (!writeDb(db)) return res.status(500).json({ error: "Failed to persist" });
  res.json(db.partners[idx]);
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
app.get("/clients", (req, res) => {
  const db = readDb();
  const status = req.query.status;
  if (status) {
    res.json(db.clients.filter(c => c.status === status));
  } else {
    res.json(db.clients);
  }
});

app.post("/clients", (req, res) => {
  const db = readDb();
  const client = req.body || {};
  const maxId = db.clients.reduce((m, c) => (c.id > m ? c.id : m), 0);
  const nextId = maxId + 1;
  // Default status is 'pending' if not specified, or use the provided status
  const newClient = { id: nextId, status: 'pending', ...client };
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

// Approve client (change status from pending to accepted)
app.post("/clients/:id/approve", (req, res) => {
  const id = Number(req.params.id);
  const db = readDb();
  const idx = db.clients.findIndex((c) => c.id === id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  db.clients[idx] = { ...db.clients[idx], status: "accepted" };
  if (!writeDb(db)) return res.status(500).json({ error: "Failed to persist" });
  res.json(db.clients[idx]);
});

// Archive client (change status to archived for removal approval)
app.post("/clients/:id/archive", (req, res) => {
  const id = Number(req.params.id);
  const db = readDb();
  const idx = db.clients.findIndex((c) => c.id === id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  db.clients[idx] = { ...db.clients[idx], status: "archived" };
  if (!writeDb(db)) return res.status(500).json({ error: "Failed to persist" });
  res.json(db.clients[idx]);
});

// Restore client from archive (change status back to accepted)
app.post("/clients/:id/restore", (req, res) => {
  const id = Number(req.params.id);
  const db = readDb();
  const idx = db.clients.findIndex((c) => c.id === id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  db.clients[idx] = { ...db.clients[idx], status: "accepted" };
  if (!writeDb(db)) return res.status(500).json({ error: "Failed to persist" });
  res.json(db.clients[idx]);
});

// CRUD for tipers
app.get("/tipers", (req, res) => {
  const db = readDb();
  const status = req.query.status;
  if (status) {
    res.json(db.tipers.filter(t => t.status === status));
  } else {
    res.json(db.tipers);
  }
});

app.post("/tipers", (req, res) => {
  const db = readDb();
  const tiper = req.body || {};
  const maxId = db.tipers.reduce((m, t) => (t.id > m ? t.id : m), 0);
  const nextId = maxId + 1;
  // Default status is 'pending' if not specified, or use the provided status
  const newTiper = { id: nextId, status: 'pending', ...tiper };
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

// Approve tiper (change status from pending to accepted)
app.post("/tipers/:id/approve", (req, res) => {
  const id = Number(req.params.id);
  const db = readDb();
  const idx = db.tipers.findIndex((t) => t.id === id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  db.tipers[idx] = { ...db.tipers[idx], status: "accepted" };
  if (!writeDb(db)) return res.status(500).json({ error: "Failed to persist" });
  res.json(db.tipers[idx]);
});

// Archive tiper (change status to archived for removal approval)
app.post("/tipers/:id/archive", (req, res) => {
  const id = Number(req.params.id);
  const db = readDb();
  const idx = db.tipers.findIndex((t) => t.id === id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  db.tipers[idx] = { ...db.tipers[idx], status: "archived" };
  if (!writeDb(db)) return res.status(500).json({ error: "Failed to persist" });
  res.json(db.tipers[idx]);
});

// Restore tiper from archive (change status back to accepted)
app.post("/tipers/:id/restore", (req, res) => {
  const id = Number(req.params.id);
  const db = readDb();
  const idx = db.tipers.findIndex((t) => t.id === id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  db.tipers[idx] = { ...db.tipers[idx], status: "accepted" };
  if (!writeDb(db)) return res.status(500).json({ error: "Failed to persist" });
  res.json(db.tipers[idx]);
});

// CRUD for future functions roadmap
app.get("/future-functions", (req, res) => {
  const db = readDb();
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  let records = db.futureFunctions ?? [];

  if (status) {
    records = records.filter((record) => record.status === status);
  }

  res.json(records);
});

app.post("/future-functions", (req, res) => {
  const db = readDb();
  const payload = { ...FUTURE_FUNCTION_DEFAULTS, ...(req.body ?? {}) };
  const maxId = db.futureFunctions.reduce((max, item) => (item.id > max ? item.id : max), 0);
  const entry = { id: maxId + 1, ...payload };
  db.futureFunctions.push(entry);
  if (!writeDb(db)) return res.status(500).json({ error: "Failed to persist" });
  res.status(201).json(entry);
});

app.put("/future-functions/:id", (req, res) => {
  const id = Number(req.params.id);
  const db = readDb();
  const idx = db.futureFunctions.findIndex((record) => record.id === id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  const updated = { ...FUTURE_FUNCTION_DEFAULTS, ...db.futureFunctions[idx], ...(req.body ?? {}), id };
  db.futureFunctions[idx] = updated;
  if (!writeDb(db)) return res.status(500).json({ error: "Failed to persist" });
  res.json(updated);
});

app.patch("/future-functions/:id", (req, res) => {
  const id = Number(req.params.id);
  const db = readDb();
  const idx = db.futureFunctions.findIndex((record) => record.id === id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  db.futureFunctions[idx] = { ...db.futureFunctions[idx], ...(req.body ?? {}), id };
  if (!writeDb(db)) return res.status(500).json({ error: "Failed to persist" });
  res.json(db.futureFunctions[idx]);
});

app.delete("/future-functions/:id", (req, res) => {
  const id = Number(req.params.id);
  const db = readDb();
  const before = db.futureFunctions.length;
  db.futureFunctions = db.futureFunctions.filter((record) => record.id !== id);
  if (db.futureFunctions.length === before) return res.status(404).json({ error: "Not found" });
  if (!writeDb(db)) return res.status(500).json({ error: "Failed to persist" });
  res.status(204).end();
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`API listening on http://0.0.0.0:${PORT}`);
  console.log(`Data file: ${DATA_FILE}`);
});
