import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import dotenv from "dotenv";
import axios from "axios";
import * as cheerio from "cheerio";

// Load environment variables
dotenv.config();

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

const toTrimmedString = value => (typeof value === "string" ? value.trim() : "");

const isPlainObject = value => value !== null && typeof value === "object" && !Array.isArray(value);

const sanitizeStringSection = (sectionName, keys, source, errors) => {
  if (!isPlainObject(source)) {
    errors.push(sectionName);
    return null;
  }

  const sanitized = {};
  for (const key of keys) {
    const trimmed = toTrimmedString(source[key]);
    if (!trimmed) {
      errors.push(`${sectionName}.${key}`);
    } else {
      sanitized[key] = trimmed;
    }
  }

  return Object.keys(sanitized).length === keys.length ? sanitized : null;
};

const ensurePalettes = db => {
  let mutated = false;
  if (!Array.isArray(db.color_palettes)) {
    db.color_palettes = cloneDefaultPalettes();
    mutated = true;
  }

  const modes = ["light", "dark"];
  let nextId = db.color_palettes.reduce((max, palette) => Math.max(max, Number(palette.id) || 0), 0);

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
      let index = 0;
      for (const palette of activePalettes) {
        palette.is_active = index === 0;
        index += 1;
      }
      mutated = true;
    }

    for (const palette of modePalettes) {
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
    }
  }

  return mutated;
};

const sanitizePalettePayload = (body = {}, { partial = false, allowMode = true } = {}) => {
  const errors = [];
  const payload = {};
  const source = body ?? {};
  const shouldValidate = field => !partial || source[field] !== undefined;

  if (shouldValidate("name")) {
    const trimmedName = toTrimmedString(source.name);
    if (!trimmedName) {
      errors.push("name");
    } else {
      payload.name = trimmedName;
    }
  }

  if (allowMode && shouldValidate("mode")) {
    if (source.mode === "light" || source.mode === "dark") {
      payload.mode = source.mode;
    } else {
      errors.push("mode");
    }
  }

  if (shouldValidate("colors")) {
    const sanitizedColors = sanitizeStringSection("colors", PALETTE_COLOR_KEYS, source.colors, errors);
    if (sanitizedColors) {
      payload.colors = sanitizedColors;
    }
  }

  if (shouldValidate("typography")) {
    const sanitizedTypography = sanitizeStringSection("typography", PALETTE_TYPOGRAPHY_KEYS, source.typography, errors);
    if (sanitizedTypography) {
      payload.typography = sanitizedTypography;
    }
  }

  if (source.is_active !== undefined) {
    payload.is_active = Boolean(source.is_active);
  }

  return { payload, errors };
};

const DEFAULT_CHAT_MODEL = "gpt-4o-mini";

const DEFAULT_PROVIDER = "openai";

const SUPPORTED_PROVIDERS = {
  openai: "openai",
  claude: "claude"
};

const parseChatRequest = body => {
  const payload = isPlainObject(body) ? body : {};
  const messages = Array.isArray(payload.messages) ? payload.messages : null;
  const model = typeof payload.model === "string" && payload.model ? payload.model : DEFAULT_CHAT_MODEL;
  const provider = typeof payload.provider === "string" && payload.provider in SUPPORTED_PROVIDERS
    ? payload.provider
    : DEFAULT_PROVIDER;
  const responseStyle = typeof payload.responseStyle === "string" ? payload.responseStyle : "concise";
  const useWebSearch = Boolean(payload.useWebSearch);
  const maxTokens = typeof payload.maxTokens === "number" && payload.maxTokens > 0 ? payload.maxTokens : 8000;
  return { messages, model, provider, responseStyle, useWebSearch, maxTokens };
};

const buildStyleInstruction = responseStyle => (
  responseStyle === "concise"
    ? "Keep answers concise and helpful. Be brief but accurate."
    : "Provide detailed, comprehensive answers. Explain concepts thoroughly with examples when relevant."
);

const buildSystemMessage = ({ model, provider, responseStyle, useWebSearch }) => {
  const currentDate = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  const providerLabel = provider === SUPPORTED_PROVIDERS.claude ? "Claude (Anthropic)" : "OpenAI";

  const intro = `You are the Walter System in-app assistant. Today's date is ${currentDate}. You are accessed via the ${providerLabel} API using the model name: ${model}. ` +
    `If a user asks what model you are, state the exact model string "${model}" and that you are provided by ${providerLabel}. Avoid speculating about other products (like ChatGPT web). `;
  const webSearchInstruction = useWebSearch
    ? "You have access to web search that fetches FULL webpage content. ALWAYS use web search for: current events, recent sports stats, weather, news, today's information, dates, or anything time-sensitive. Don't rely on your training data for current information - search the web! "
    : "";

  return {
    role: "system",
    content: intro + webSearchInstruction + buildStyleInstruction(responseStyle)
  };
};

const shouldUseResponsesApi = model => {
  const normalized = model.toLowerCase();
  return normalized.includes("gpt-5-pro") || normalized.includes("gpt-6-pro");
};

const isRestrictedModelName = model => (
  model.startsWith("o1") ||
  model.startsWith("o3") ||
  model.toLowerCase().includes("gpt-5")
);

const buildStandardChatParams = ({ model, messagesWithSystem, useWebSearch }) => {
  const params = { model, messages: messagesWithSystem };

  if (useWebSearch) {
    params.tools = [webSearchTool];
    params.tool_choice = "auto";
  }

  const restricted = isRestrictedModelName(model);

  if (restricted) {
    params.max_completion_tokens = 4000;
    delete params.tools;
    delete params.tool_choice;
  } else {
    params.temperature = 0.7;
    params.max_tokens = 8000;
  }

  return { params, restricted };
};

const buildFollowUpParams = ({ model, messages }) => {
  const params = { model, messages };
  if (isRestrictedModelName(model)) {
    params.max_completion_tokens = 4000;
  } else {
    params.temperature = 0.7;
    params.max_tokens = 8000;
  }
  return params;
};

const executeWebSearchToolCall = async toolCall => {
  try {
    const args = JSON.parse(toolCall.function.arguments);
    console.log("Executing web search:", args.query);
    const searchResults = await searchWeb(args.query, args.max_results || 3);
    const resultsText = searchResults.map((result, index) => {
      let text = `${index + 1}. ${result.title}\n   URL: ${result.url}\n   Description: ${result.description}`;
      if (result.content) {
        text += `\n   Content: ${result.content}`;
      }
      return text;
    }).join('\n\n');

    return {
      role: "tool",
      tool_call_id: toolCall.id,
      content: `Search results for "${args.query}":\n\n${resultsText}`
    };
  } catch (error) {
    console.error("Web search error:", error);
    return {
      role: "tool",
      tool_call_id: toolCall.id,
      content: `Error performing web search: ${error.message}`
    };
  }
};

const processToolCalls = async ({ assistantMessage, baseConversation, model }) => {
  if (!assistantMessage?.tool_calls || assistantMessage.tool_calls.length === 0) {
    return null;
  }

  const conversation = [...baseConversation, assistantMessage];

  for (const toolCall of assistantMessage.tool_calls) {
    if (toolCall.function?.name === "web_search") {
      const toolMessage = await executeWebSearchToolCall(toolCall);
      conversation.push(toolMessage);
    }
  }

  const followUpParams = buildFollowUpParams({ model, messages: conversation });
  console.log("Making follow-up call with function results");
  const completion = await openai.chat.completions.create(followUpParams);
  return {
    completion,
    responseMessage: completion.choices?.[0]?.message?.content ?? ""
  };
};

const ensureNonEmptyResponse = (responseMessage, model, completion) => {
  if (responseMessage && responseMessage.trim().length > 0) {
    return responseMessage;
  }
  console.error("Empty response received from API. Model:", model, "Completion:", completion);
  return "I apologize, but I received an empty response. Please try again or rephrase your question.";
};

const runResponsesApiFlow = async ({ model, messagesWithSystem }) => {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: messagesWithSystem
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData?.error?.message || `Responses API error: ${response.status}`);
  }

  const data = await response.json();
  console.log("Responses API raw data:", JSON.stringify(data, null, 2));

  let responseMessage = null;

  if (typeof data.response === "string") {
    responseMessage = data.response;
  }

  if (!responseMessage && data.data?.text) {
    responseMessage = data.data.text;
  }

  if (!responseMessage && Array.isArray(data.output)) {
    for (const item of data.output) {
      if (item.type === "message") {
        if (Array.isArray(item.content)) {
          const textParts = item.content
            .filter(chunk => chunk?.type === "text" && chunk?.text)
            .map(chunk => chunk.text)
            .join("");
          if (textParts) {
            responseMessage = textParts;
            break;
          }
        } else if (typeof item.content === "string") {
          responseMessage = item.content;
          break;
        }
      }

      if (!responseMessage && item.text) {
        responseMessage = item.text;
        break;
      }
    }
  }

  if (!responseMessage && data.choices?.[0]?.message?.content) {
    responseMessage = data.choices[0].message.content;
  }

  if (!responseMessage && data.content) {
    responseMessage = data.content;
  }

  if (!responseMessage) {
    console.error("Could not extract response from Responses API. Full data structure keys:", Object.keys(data));
    responseMessage = `[Debug] Unable to parse response. Received: ${JSON.stringify(data).substring(0, 200)}...`;
  }

  if (typeof responseMessage !== "string") {
    console.warn("Non-string response, stringifying:", responseMessage);
    responseMessage = JSON.stringify(responseMessage);
  }

  const completion = {
    choices: [{ message: { content: responseMessage } }],
    usage: data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
  };

  return { completion, responseMessage, model };
};

const runStandardChatFlow = async ({ model, messagesWithSystem, useWebSearch }) => {
  const { params, restricted } = buildStandardChatParams({ model, messagesWithSystem, useWebSearch });
  console.log("Calling OpenAI with params:", { model, messageCount: messagesWithSystem.length, useWebSearch, ...params });
  const completion = await openai.chat.completions.create(params);
  console.log("OpenAI response - finish_reason:", completion.choices?.[0]?.finish_reason);

  const assistantMessage = completion.choices?.[0]?.message ?? {};
  let responseMessage = assistantMessage.content ?? "";

  if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
    const toolCallResult = await processToolCalls({
      assistantMessage,
      baseConversation: messagesWithSystem,
      model
    });

    if (toolCallResult) {
      return toolCallResult;
    }
  }

  return { completion, responseMessage, restricted, model: completion.model || model };
};

// ================================
// Claude (Anthropic) Integration
// ================================

const CLAUDE_DEFAULT_MODEL = "claude-sonnet-4-5";
const CLAUDE_MODEL_FALLBACKS = {
  "claude-sonnet-4-5": [
    "claude-sonnet-4-5",
    "claude-3-5-sonnet-20241022",
    "claude-3-haiku-20240307"
  ]
};

const normalizeClaudeMessages = messages => {
  if (!Array.isArray(messages)) return [];

  return messages
    .map(msg => {
      if (msg.role === "assistant" || msg.role === "user") {
        return {
          role: msg.role,
          content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content ?? "")
        };
      }
      return null;
    })
    .filter(Boolean);
};

const ensureUserFirstMessage = claudeMessages => {
  if (claudeMessages.length === 0) {
    throw new Error("Claude requires at least one user message");
  }

  if (claudeMessages[0].role !== "user") {
    throw new Error("Claude messages must start with a user role");
  }
};

const callClaudeRequest = async ({ model, systemPrompt, chatMessages, maxTokens = 8000 }) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Claude API key not configured (ANTHROPIC_API_KEY)");
  }

  const mappedModel = model || CLAUDE_DEFAULT_MODEL;
  const claudeMessages = normalizeClaudeMessages(chatMessages);
  ensureUserFirstMessage(claudeMessages);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: mappedModel,
      max_tokens: maxTokens,
      system: typeof systemPrompt === "string" ? systemPrompt : undefined,
      messages: claudeMessages
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData?.error?.message || `Claude API error: ${response.status}`;
    const err = new Error(message);
    const type = errorData?.error?.type;
    const text = typeof message === "string" ? message.toLowerCase() : "";
    err.isClaudeModelFallbackError = type === "model_not_found" || text.includes("model");
    err.details = errorData;
    err.status = response.status;
    throw err;
  }

  const data = await response.json();

  let text = "";
  if (Array.isArray(data.content)) {
    for (const block of data.content) {
      if (block.type === "text" && typeof block.text === "string") {
        text += block.text;
      }
    }
  }

  const usage = data.usage || { input_tokens: 0, output_tokens: 0 }; 

  return {
    completion: {
      choices: [{ message: { content: text } }],
      usage: {
        prompt_tokens: usage.input_tokens || 0,
        completion_tokens: usage.output_tokens || 0,
        total_tokens: (usage.input_tokens || 0) + (usage.output_tokens || 0)
      }
    },
    responseMessage: text,
    model: mappedModel
  };
};

const callClaude = async ({ model, ...rest }) => {
  const attempts = CLAUDE_MODEL_FALLBACKS[model] || [model];
  let lastError = null;

  for (const attempt of attempts) {
    try {
      return await callClaudeRequest({ ...rest, model: attempt });
    } catch (error) {
      lastError = error;
      if (!error?.isClaudeModelFallbackError) {
        throw error;
      }
      console.warn(`Claude model "${attempt}" failed (${error.message}). Trying fallback if available...`);
    }
  }

  throw lastError ?? new Error("Claude request failed");
};

const getNextPaletteId = palettes => palettes.reduce(
  (max, palette) => Math.max(max, typeof palette.id === "number" ? palette.id : 0),
  0
) + 1;

const setActivePalette = (palettes, id) => {
  const palette = palettes.find(item => item.id === id);
  if (!palette) return null;
  for (const item of palettes) {
    if (item.mode === palette.mode) {
      item.is_active = item.id === palette.id;
    }
  }
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

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Fetch and extract webpage content
async function fetchWebpageContent(url, maxLength = 3000) {
  try {
    const response = await axios.get(url, {
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    
    // Remove script, style, and other non-content elements
    $('script, style, nav, footer, header, iframe, noscript').remove();
    
    // Extract text from main content areas
    let content = '';
    const selectors = ['article', 'main', '.content', '#content', '.post-content', '.entry-content', 'body'];
    
    for (const selector of selectors) {
      const element = $(selector);
      if (element.length > 0) {
        content = element.text();
        break;
      }
    }
    
    // Fallback to body if no content found
    if (!content) {
      content = $('body').text();
    }
    
    // Clean up whitespace
    content = content
      .replaceAll(/\s+/g, ' ')
      .replaceAll(/\n+/g, '\n')
      .trim();
    
    // Truncate if too long
    if (content.length > maxLength) {
      content = content.substring(0, maxLength) + '...';
    }
    
    return content;
  } catch (error) {
    console.error(`Failed to fetch ${url}:`, error.message);
    return null;
  }
}

// Web Search Function using Brave Search API
async function searchWeb(query, maxResults = 3, fetchContent = true) {
  const braveApiKey = process.env.BRAVE_SEARCH_API_KEY;
  
  if (!braveApiKey || braveApiKey === 'your_brave_search_api_key_here') {
    throw new Error('Brave Search API key not configured. Get one at https://brave.com/search/api/');
  }

  try {
    const response = await axios.get('https://api.search.brave.com/res/v1/web/search', {
      params: {
        q: query,
        count: maxResults,
      },
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': braveApiKey,
      },
    });

    const results = response.data.web?.results || [];
    
    // Fetch actual webpage content for better results
    const enrichedResults = [];
    for (const result of results) {
      const enrichedResult = {
        title: result.title,
        url: result.url,
        description: result.description,
        snippet: result.extra_snippets?.join(' ') || result.description,
      };
      
      if (fetchContent) {
        console.log(`Fetching content from: ${result.url}`);
        const content = await fetchWebpageContent(result.url);
        if (content) {
          enrichedResult.content = content;
        }
      }
      
      enrichedResults.push(enrichedResult);
    }
    
    return enrichedResults;
  } catch (error) {
    console.error('Brave Search error:', error.response?.data || error.message);
    throw new Error(`Web search failed: ${error.message}`);
  }
}

// Define the web search tool for OpenAI function calling
const webSearchTool = {
  type: "function",
  function: {
    name: "web_search",
    description: "Search the web and fetch actual webpage content for CURRENT, UP-TO-DATE information. This tool fetches full webpage content. YOU MUST USE THIS for: current sports statistics/scores, weather forecasts, today's news, recent events, current season data, or ANY time-sensitive information. Your training data is outdated - always search for current information!",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query to find information on the web",
        },
        max_results: {
          type: "number",
          description: "Maximum number of search results to return (default: 5)",
          default: 5,
        },
      },
      required: ["query"],
    },
  },
};

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
    if (!obj.partners) {
      obj.partners = [];
    }
    if (!obj.clients) {
      obj.clients = [];
    }
    if (!obj.tipers) {
      obj.tipers = [];
    }
    if (!obj.futureFunctions) {
      obj.futureFunctions = [];
    }
    // Keep backwards compatibility
    if (!obj.users) {
      obj.users = [];
    }
    if (!obj.employees) {
      obj.employees = [];
    }
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
  const maxId = db.users.reduce((m, u) => Math.max(m, Number(u.id) || 0), 0);
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
  const maxId = db.partners.reduce((m, p) => Math.max(m, Number(p.id) || 0), 0);
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
    for (const item of db.color_palettes) {
      if (item.mode === newPalette.mode) {
        item.is_active = false;
      }
    }
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
  const maxId = db.employees.reduce((m, e) => Math.max(m, Number(e.id) || 0), 0);
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
  const maxId = db.clients.reduce((m, c) => Math.max(m, Number(c.id) || 0), 0);
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
  const maxId = db.tipers.reduce((m, t) => Math.max(m, Number(t.id) || 0), 0);
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
  const body = isPlainObject(req.body) ? req.body : {};
  const payload = { ...FUTURE_FUNCTION_DEFAULTS, ...body };
  const maxId = db.futureFunctions.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0);
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
  const body = isPlainObject(req.body) ? req.body : {};
  const updated = { ...FUTURE_FUNCTION_DEFAULTS, ...db.futureFunctions[idx], ...body, id };
  db.futureFunctions[idx] = updated;
  if (!writeDb(db)) return res.status(500).json({ error: "Failed to persist" });
  res.json(updated);
});

app.patch("/future-functions/:id", (req, res) => {
  const id = Number(req.params.id);
  const db = readDb();
  const idx = db.futureFunctions.findIndex((record) => record.id === id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });
  const body = isPlainObject(req.body) ? req.body : {};
  db.futureFunctions[idx] = { ...db.futureFunctions[idx], ...body, id };
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

// ============================================
// AI CHATBOT ENDPOINT
// ============================================

app.post("/api/chat", async (req, res) => {
  console.log("/api/chat hit at", new Date().toISOString());
  console.log("API key set:", !!process.env.OPENAI_API_KEY);

  try {
  const { messages, model, provider, responseStyle, useWebSearch, maxTokens } = parseChatRequest(req.body);

    if (!messages) {
      return res.status(400).json({ error: "Messages array is required" });
    }

    if (provider === SUPPORTED_PROVIDERS.openai && !process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OpenAI API key not configured" });
    }

    if (provider === SUPPORTED_PROVIDERS.claude && !process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: "Claude API key not configured" });
    }

    const systemMessage = buildSystemMessage({ model, provider, responseStyle, useWebSearch });
    const messagesWithSystem = [systemMessage, ...messages];
    const claudeSystemPrompt = typeof systemMessage.content === "string" ? systemMessage.content : undefined;

    let flowResult;
    if (provider === SUPPORTED_PROVIDERS.claude) {
      flowResult = await callClaude({
        model,
        systemPrompt: claudeSystemPrompt,
        chatMessages: messages,
        maxTokens
      });
    } else {
      flowResult = shouldUseResponsesApi(model)
        ? await runResponsesApiFlow({ model, messagesWithSystem, maxTokens })
        : await runStandardChatFlow({ model, messagesWithSystem, useWebSearch, maxTokens });
    }

    const message = ensureNonEmptyResponse(flowResult.responseMessage, model, flowResult.completion);
    const resolvedModel = flowResult.model ?? model;
    console.log("Final response message length:", message.length, "chars");

    res.json({
      message,
      model: resolvedModel,
      usage: flowResult.completion.usage
    });
  } catch (error) {
    const status = error.status || error.code || 500;
    const errPayload = {
      error: "Failed to get AI response",
      message: error.message,
      type: error?.error?.type || error?.name,
      code: error?.error?.code || undefined,
      details:
        error?.error?.message ||
        error?.response?.data?.error?.message ||
        error?.response?.data ||
        undefined
    };
    console.error("OpenAI API Error:", JSON.stringify(errPayload, null, 2));
    res.status(Number.isInteger(status) ? status : 500).json(errPayload);
  }
});

// ============================================
// AI CHATBOT STREAMING ENDPOINT
// ============================================

app.post("/api/chat/stream", async (req, res) => {
  console.log("/api/chat/stream hit at", new Date().toISOString());
  
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  try {
    const { messages, model = "gpt-4o-mini", responseStyle = "concise", useWebSearch = false, maxTokens = 8000 } = req.body ?? {};

    if (!messages || !Array.isArray(messages)) {
      res.write(`data: ${JSON.stringify({ error: "Messages array is required" })}\n\n`);
      res.end();
      return;
    }

    if (!process.env.OPENAI_API_KEY) {
      res.write(`data: ${JSON.stringify({ error: "OpenAI API key not configured" })}\n\n`);
      res.end();
      return;
    }

    // Build system instruction
    let styleInstruction = "";
    if (responseStyle === "concise") {
      styleInstruction = "Keep answers concise and helpful. Be brief but accurate.";
    } else {
      styleInstruction = "Provide detailed, comprehensive answers. Explain concepts thoroughly with examples when relevant.";
    }

    // Get current date for context
    const currentDate = new Date().toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    const systemMessage = {
      role: "system",
      content:
        `You are the Walter System in-app assistant. Today's date is ${currentDate}. You are accessed via the OpenAI API using the model name: ${model}. ` +
        `If a user asks what model you are, state the exact model string "${model}". Avoid speculating about other products (like ChatGPT web). ` +
        (useWebSearch 
          ? "You have access to web search that fetches FULL webpage content. ALWAYS use web search for: current events, recent sports stats, weather, news, today's information, dates, or anything time-sensitive. Don't rely on your training data for current information - search the web! " 
          : "") +
        styleInstruction,
    };

    const messagesWithSystem = Array.isArray(messages)
      ? [systemMessage, ...messages]
      : [systemMessage];

    // API parameters
    const apiParams = {
      model,
      messages: messagesWithSystem,
      stream: true, // Enable streaming
    };

    // Add web search tool if enabled
    if (useWebSearch) {
      apiParams.tools = [webSearchTool];
      apiParams.tool_choice = "auto";
    }

    const isRestrictedModel = model.startsWith('o1') || 
                             model.startsWith('o3') || 
                             model.toLowerCase().includes('gpt-5');
    
    if (isRestrictedModel) {
      apiParams.max_completion_tokens = Math.min(maxTokens, 4000);
      // Reasoning models don't support function calling yet
      delete apiParams.tools;
      delete apiParams.tool_choice;
    } else {
      apiParams.temperature = 0.7;
      apiParams.max_tokens = maxTokens;
    }

    console.log("Starting stream with model:", model, "useWebSearch:", useWebSearch);
    const stream = await openai.chat.completions.create(apiParams);

    let fullContent = '';
    let totalTokens = { prompt: 0, completion: 0, total: 0 };
    let toolCalls = [];
    let currentToolCall = null;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      
      // Handle text content
      const content = delta?.content || '';
      if (content) {
        fullContent += content;
        res.write(`data: ${JSON.stringify({ type: 'content', content })}\n\n`);
      }

      // Handle tool calls (function calling)
      if (delta?.tool_calls) {
        for (const toolCallDelta of delta.tool_calls) {
          if (toolCallDelta.index !== undefined) {
            if (!toolCalls[toolCallDelta.index]) {
              toolCalls[toolCallDelta.index] = {
                id: toolCallDelta.id || '',
                type: 'function',
                function: {
                  name: toolCallDelta.function?.name || '',
                  arguments: toolCallDelta.function?.arguments || ''
                }
              };
            } else {
              // Append to existing tool call
              if (toolCallDelta.function?.arguments) {
                toolCalls[toolCallDelta.index].function.arguments += toolCallDelta.function.arguments;
              }
            }
          }
        }
      }

      // Check for completion
      if (chunk.choices[0]?.finish_reason) {
        const finishReason = chunk.choices[0].finish_reason;
        
        // Handle function calling
        if (finishReason === 'tool_calls' && toolCalls.length > 0) {
          console.log("Function call detected in stream:", toolCalls);
          
          // Notify client that we're executing a function
          res.write(`data: ${JSON.stringify({ type: 'function_call', message: 'Searching the web...' })}\n\n`);
          
          // Add assistant message with tool calls
          messagesWithSystem.push({
            role: 'assistant',
            content: null,
            tool_calls: toolCalls
          });
          
          // Execute tool calls
          for (const toolCall of toolCalls) {
            if (toolCall.function.name === 'web_search') {
              try {
                const args = JSON.parse(toolCall.function.arguments);
                console.log("Executing web search:", args.query);
                
                const searchResults = await searchWeb(args.query, args.max_results || 3);
                
                const resultsText = searchResults.map((r, i) => {
                  let resultText = `${i + 1}. ${r.title}\n   URL: ${r.url}\n   Description: ${r.description}`;
                  if (r.content) {
                    resultText += `\n   Content: ${r.content}`;
                  }
                  return resultText;
                }).join('\n\n');
                
                messagesWithSystem.push({
                  role: "tool",
                  tool_call_id: toolCall.id,
                  content: `Search results for "${args.query}":\n\n${resultsText}`,
                });
              } catch (error) {
                console.error("Web search error:", error);
                messagesWithSystem.push({
                  role: "tool",
                  tool_call_id: toolCall.id,
                  content: `Error performing web search: ${error.message}`,
                });
              }
            }
          }
          
          // Make follow-up streaming request with function results
          const followUpParams = {
            model,
            messages: messagesWithSystem,
            stream: true,
          };
          
          if (!isRestrictedModel) {
            followUpParams.temperature = 0.7;
            followUpParams.max_tokens = 8000;
          } else {
            followUpParams.max_completion_tokens = 4000;
          }
          
          console.log("Making follow-up stream with function results");
          const followUpStream = await openai.chat.completions.create(followUpParams);
          
          fullContent = ''; // Reset for follow-up response
          
          for await (const followUpChunk of followUpStream) {
            const followUpContent = followUpChunk.choices[0]?.delta?.content || '';
            if (followUpContent) {
              fullContent += followUpContent;
              res.write(`data: ${JSON.stringify({ type: 'content', content: followUpContent })}\n\n`);
            }
            
            if (followUpChunk.choices[0]?.finish_reason) {
              if (followUpChunk.usage) {
                totalTokens = {
                  prompt: followUpChunk.usage.prompt_tokens || 0,
                  completion: followUpChunk.usage.completion_tokens || 0,
                  total: followUpChunk.usage.total_tokens || 0,
                };
              }
              res.write(`data: ${JSON.stringify({ 
                type: 'done', 
                model, 
                usage: totalTokens,
                finish_reason: followUpChunk.choices[0].finish_reason 
              })}\n\n`);
            }
          }
        } else {
          // Normal completion without function calls
          if (chunk.usage) {
            totalTokens = {
              prompt: chunk.usage.prompt_tokens || 0,
              completion: chunk.usage.completion_tokens || 0,
              total: chunk.usage.total_tokens || 0,
            };
          }
          res.write(`data: ${JSON.stringify({ 
            type: 'done', 
            model, 
            usage: totalTokens,
            finish_reason: finishReason 
          })}\n\n`);
        }
      }
    }

    res.end();

  } catch (error) {
    console.error("Streaming error:", error);
    res.write(`data: ${JSON.stringify({ 
      type: 'error',
      error: error.message || 'Streaming failed'
    })}\n\n`);
    res.end();
  }
});

// ============================================
// CONVERSATION MANAGEMENT ENDPOINTS
// ============================================

// Get all conversations
app.get("/api/conversations", (req, res) => {
  const db = readDb();
  const conversations = db.conversations || [];
  res.json(conversations);
});

// Get single conversation
app.get("/api/conversations/:id", (req, res) => {
  const db = readDb();
  const conversation = db.conversations?.find(c => c.id === req.params.id);
  if (!conversation) {
    return res.status(404).json({ error: "Conversation not found" });
  }
  res.json(conversation);
});

// Create new conversation
app.post("/api/conversations", (req, res) => {
  const db = readDb();
  if (!db.conversations) db.conversations = [];
  
  const conversation = {
    id: `conv_${Date.now()}`,
    title: req.body.title || "New Conversation",
    messages: req.body.messages || [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  db.conversations.push(conversation);
  if (!writeDb(db)) return res.status(500).json({ error: "Failed to save" });
  res.json(conversation);
});

// Update conversation
app.put("/api/conversations/:id", (req, res) => {
  const db = readDb();
  const index = db.conversations?.findIndex(c => c.id === req.params.id);
  
  if (index === -1 || index === undefined) {
    return res.status(404).json({ error: "Conversation not found" });
  }
  
  db.conversations[index] = {
    ...db.conversations[index],
    ...req.body,
    updatedAt: new Date().toISOString(),
  };
  
  if (!writeDb(db)) return res.status(500).json({ error: "Failed to save" });
  res.json(db.conversations[index]);
});

// Delete conversation
app.delete("/api/conversations/:id", (req, res) => {
  const db = readDb();
  const index = db.conversations?.findIndex(c => c.id === req.params.id);
  
  if (index === -1 || index === undefined) {
    return res.status(404).json({ error: "Conversation not found" });
  }
  
  db.conversations.splice(index, 1);
  if (!writeDb(db)) return res.status(500).json({ error: "Failed to delete" });
  res.status(204).end();
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`API listening on http://0.0.0.0:${PORT}`);
  console.log(`Data file: ${DATA_FILE}`);
});
