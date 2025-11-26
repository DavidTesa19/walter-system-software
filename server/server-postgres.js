import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import OpenAI from "openai";
import axios from "axios";
import * as cheerio from "cheerio";
import multer from "multer";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import db, { initDatabase } from "./db.js";

dotenv.config();

const openai = process.env.OPENAI_API_KEY 
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3004;
const JWT_SECRET = process.env.JWT_SECRET || "walter-secret-key-change-in-prod";

// Middleware to authenticate token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

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

const DOCUMENT_ENTITY_TYPES = new Set(["clients", "partners", "tipers"]);
const MAX_DOCUMENT_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_DOCUMENT_SIZE_BYTES }
});

const sanitizeFilename = (value) => {
  if (typeof value !== "string" || !value.trim()) {
    return "document";
  }
  // Prevent directory traversal and trim length
  const safe = path.basename(value).replace(/[\r\n]/g, "").trim();
  return safe.length > 180 ? safe.slice(-180) : safe;
};

const stripDocumentData = (doc) => {
  if (!doc) {
    return null;
  }

  return {
    id: doc.id,
    entityType: doc.entityType ?? doc.entity_type,
    entityId: doc.entityId ?? doc.entity_id,
    filename: doc.filename,
    mimeType: doc.mimeType ?? doc.mime_type,
    sizeBytes: Number(doc.sizeBytes ?? doc.size_bytes ?? 0),
    createdAt: doc.createdAt ?? doc.created_at
  };
};

const ensureDocumentsCollection = (store) => {
  if (!Array.isArray(store.documents)) {
    store.documents = [];
  }
};

const nextDocumentId = (store) => {
  ensureDocumentsCollection(store);
  return store.documents.reduce((max, doc) => Math.max(max, Number(doc.id) || 0), 0) + 1;
};

const findDocumentInStore = (store, id) => {
  ensureDocumentsCollection(store);
  return store.documents.find((doc) => Number(doc.id) === id) ?? null;
};

const removeDocumentFromStore = (store, id) => {
  ensureDocumentsCollection(store);
  const idx = store.documents.findIndex((doc) => Number(doc.id) === id);
  if (idx === -1) {
    return null;
  }
  const [removed] = store.documents.splice(idx, 1);
  return removed ?? null;
};

const isDocumentEntity = (value = "") => DOCUMENT_ENTITY_TYPES.has(value);

const DEFAULT_CHAT_MODEL = "gpt-4o-mini";
const DEFAULT_PROVIDER = "openai";
const SUPPORTED_PROVIDERS = {
  openai: "openai",
  claude: "claude"
};

const parseChatRequest = body => {
  const payload = typeof body === "object" && body !== null ? body : {};
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

const buildStandardChatParams = ({ model, messagesWithSystem, useWebSearch, maxTokens = 8000 }) => {
  const params = { model, messages: messagesWithSystem };

  if (useWebSearch) {
    params.tools = [webSearchTool];
    params.tool_choice = "auto";
  }

  const restricted = isRestrictedModelName(model);

  if (restricted) {
    params.max_completion_tokens = Math.min(maxTokens, 4000);
    delete params.tools;
    delete params.tool_choice;
  } else {
    params.temperature = 0.7;
    params.max_tokens = maxTokens;
  }

  return { params, restricted };
};

const buildFollowUpParams = ({ model, messages, maxTokens = 8000 }) => {
  const params = { model, messages };
  if (isRestrictedModelName(model)) {
    params.max_completion_tokens = Math.min(maxTokens, 4000);
  } else {
    params.temperature = 0.7;
    params.max_tokens = maxTokens;
  }
  return params;
};

const executeWebSearchToolCall = async toolCall => {
  try {
    const args = JSON.parse(toolCall.function.arguments);
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

const processToolCalls = async ({ assistantMessage, baseConversation, model, maxTokens = 8000 }) => {
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

  const followUpParams = buildFollowUpParams({ model, messages: conversation, maxTokens });
  if (!openai) {
    throw new Error("OpenAI client not initialized. Please set OPENAI_API_KEY environment variable.");
  }
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
    responseMessage = JSON.stringify(responseMessage);
  }

  const completion = {
    choices: [{ message: { content: responseMessage } }],
    usage: data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
  };

  return { completion, responseMessage, model };
};

const runStandardChatFlow = async ({ model, messagesWithSystem, useWebSearch, maxTokens = 8000 }) => {
  const { params, restricted } = buildStandardChatParams({ model, messagesWithSystem, useWebSearch, maxTokens });
  if (!openai) {
    throw new Error("OpenAI client not initialized. Please set OPENAI_API_KEY environment variable.");
  }
  const completion = await openai.chat.completions.create(params);

  const assistantMessage = completion.choices?.[0]?.message ?? {};
  let responseMessage = assistantMessage.content ?? "";

  if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
    const toolCallResult = await processToolCalls({
      assistantMessage,
      baseConversation: messagesWithSystem,
      model,
      maxTokens
    });

    if (toolCallResult) {
      return toolCallResult;
    }
  }

  return { completion, responseMessage, restricted, model: completion.model || model };
};

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

const callClaudeRequest = async ({ model, systemPrompt, chatMessages, maxTokens = 8000, useWebSearch = false }) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Claude API key not configured (ANTHROPIC_API_KEY)");
  }

  const mappedModel = model || CLAUDE_DEFAULT_MODEL;
  console.log("Claude API call with maxTokens:", maxTokens, "model:", mappedModel);
  const claudeMessages = normalizeClaudeMessages(chatMessages);
  ensureUserFirstMessage(claudeMessages);

  const requestBody = {
    model: mappedModel,
    max_tokens: maxTokens,
    system: typeof systemPrompt === "string" ? systemPrompt : undefined,
    messages: claudeMessages
  };

  // Add web search tool if enabled
  if (useWebSearch && process.env.BRAVE_SEARCH_API_KEY) {
    requestBody.tools = [{
      name: "web_search",
      description: "Search the web for current information, news, facts, or any real-time data. Returns full webpage content.",
      input_schema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The search query to look up on the web"
          }
        },
        required: ["query"]
      }
    }];
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify(requestBody)
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
  let toolUse = null;

  if (Array.isArray(data.content)) {
    for (const block of data.content) {
      if (block.type === "text" && typeof block.text === "string") {
        text += block.text;
      }
      if (block.type === "tool_use") {
        toolUse = block;
      }
    }
  }

  // If Claude wants to use a tool, execute it and make a follow-up request
  if (toolUse && useWebSearch) {
    console.log("Claude requested tool use:", toolUse.name, "with input:", toolUse.input);
    
    let toolResult = "";
    if (toolUse.name === "web_search" && toolUse.input?.query) {
      try {
        const searchResults = await searchWeb(toolUse.input.query);
        toolResult = JSON.stringify(searchResults, null, 2);
      } catch (error) {
        toolResult = `Error performing web search: ${error.message}`;
      }
    }

    // Make follow-up request with tool result
    const followUpMessages = [
      ...claudeMessages,
      {
        role: "assistant",
        content: data.content
      },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: toolResult
          }
        ]
      }
    ];

    const followUpResponse = await fetch("https://api.anthropic.com/v1/messages", {
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
        messages: followUpMessages,
        tools: requestBody.tools
      })
    });

    if (!followUpResponse.ok) {
      const errorData = await followUpResponse.json().catch(() => ({}));
      throw new Error(errorData?.error?.message || `Claude follow-up API error: ${followUpResponse.status}`);
    }

    const followUpData = await followUpResponse.json();
    text = "";
    if (Array.isArray(followUpData.content)) {
      for (const block of followUpData.content) {
        if (block.type === "text" && typeof block.text === "string") {
          text += block.text;
        }
      }
    }

    const usage = data.usage || { input_tokens: 0, output_tokens: 0 };
    const followUpUsage = followUpData.usage || { input_tokens: 0, output_tokens: 0 };
    return {
      completion: {
        choices: [{ message: { content: text } }],
        usage: {
          prompt_tokens: (usage.input_tokens || 0) + (followUpUsage.input_tokens || 0),
          completion_tokens: (usage.output_tokens || 0) + (followUpUsage.output_tokens || 0),
          total_tokens: (usage.input_tokens || 0) + (usage.output_tokens || 0) + (followUpUsage.input_tokens || 0) + (followUpUsage.output_tokens || 0)
        }
      },
      responseMessage: text,
      model: mappedModel
    };
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

async function fetchWebpageContent(url, maxLength = 3000) {
  try {
    const response = await axios.get(url, {
      timeout: 5000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
      }
    });

    const $ = cheerio.load(response.data);
    $("script, style, nav, footer, header, iframe, noscript").remove();

    let content = "";
    const selectors = ["article", "main", ".content", "#content", ".post-content", ".entry-content", "body"];

    for (const selector of selectors) {
      const element = $(selector);
      if (element.length > 0) {
        content = element.text();
        break;
      }
    }

    if (!content) {
      content = $("body").text();
    }

    content = content
      .replaceAll(/\s+/g, " ")
      .replaceAll(/\n+/g, "\n")
      .trim();

    if (content.length > maxLength) {
      content = content.substring(0, maxLength) + "...";
    }

    return content;
  } catch (error) {
    console.error(`Failed to fetch ${url}:`, error.message);
    return null;
  }
}

async function searchWeb(query, maxResults = 3, fetchContent = true) {
  const braveApiKey = process.env.BRAVE_SEARCH_API_KEY;

  if (!braveApiKey || braveApiKey === "your_brave_search_api_key_here") {
    throw new Error("Brave Search API key not configured. Get one at https://brave.com/search/api/");
  }

  try {
    const response = await axios.get("https://api.search.brave.com/res/v1/web/search", {
      params: {
        q: query,
        count: maxResults
      },
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": braveApiKey
      }
    });

    const results = response.data.web?.results || [];
    const enrichedResults = [];
    for (const result of results) {
      const enrichedResult = {
        title: result.title,
        url: result.url,
        description: result.description,
        snippet: result.extra_snippets?.join(" ") || result.description
      };

      if (fetchContent) {
        const content = await fetchWebpageContent(result.url);
        if (content) {
          enrichedResult.content = content;
        }
      }

      enrichedResults.push(enrichedResult);
    }

    return enrichedResults;
  } catch (error) {
    console.error("Brave Search error:", error.response?.data || error.message);
    throw new Error(`Web search failed: ${error.message}`);
  }
}

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
          description: "The search query to find information on the web"
        },
        max_results: {
          type: "number",
          description: "Maximum number of search results to return (default: 5)",
          default: 5
        }
      },
      required: ["query"]
    }
  }
};

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
          documents: [],
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
  if (!Array.isArray(obj.documents)) obj.documents = [];
  if (!Array.isArray(obj.conversations)) obj.conversations = [];
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
      documents: [],
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

// ============================================
// AI CHATBOT ENDPOINTS
// ============================================

app.post("/api/chat", async (req, res) => {
  try {
    const { messages, model, provider, responseStyle, useWebSearch, maxTokens } = parseChatRequest(req.body);
    console.log("Received maxTokens:", maxTokens, "for model:", model, "provider:", provider);

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
        maxTokens,
        useWebSearch
      });
    } else {
      flowResult = shouldUseResponsesApi(model)
        ? await runResponsesApiFlow({ model, messagesWithSystem, maxTokens })
        : await runStandardChatFlow({ model, messagesWithSystem, useWebSearch, maxTokens });
    }

    const message = ensureNonEmptyResponse(flowResult.responseMessage, model, flowResult.completion);
    const resolvedModel = flowResult.model ?? model;

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
    console.error("Chat API Error:", JSON.stringify(errPayload, null, 2));
    res.status(Number.isInteger(status) ? status : 500).json(errPayload);
  }
});

app.post("/api/chat/stream", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const { messages, model = "gpt-4o-mini", responseStyle = "concise", useWebSearch = false, maxTokens = 8000 } = req.body ?? {};
    console.log("Received maxTokens:", maxTokens, "for model:", model, "useWebSearch:", useWebSearch);

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

    const styleInstruction = responseStyle === "concise"
      ? "Keep answers concise and helpful. Be brief but accurate."
      : "Provide detailed, comprehensive answers. Explain concepts thoroughly with examples when relevant.";

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
        styleInstruction
    };

    const messagesWithSystem = Array.isArray(messages)
      ? [systemMessage, ...messages]
      : [systemMessage];

    const apiParams = {
      model,
      messages: messagesWithSystem,
      stream: true
    };

    if (useWebSearch) {
      apiParams.tools = [webSearchTool];
      apiParams.tool_choice = "auto";
    }

    const isRestrictedModel = model.startsWith('o1') ||
      model.startsWith('o3') ||
      model.toLowerCase().includes('gpt-5');

    if (isRestrictedModel) {
      apiParams.max_completion_tokens = Math.min(maxTokens, 4000);
      delete apiParams.tools;
      delete apiParams.tool_choice;
    } else {
      apiParams.temperature = 0.7;
      apiParams.max_tokens = maxTokens;
    }

    if (!openai) {
      res.write(`data: ${JSON.stringify({ error: "OpenAI client not initialized. Please set OPENAI_API_KEY environment variable." })}\n\n`);
      res.end();
      return;
    }

    const stream = await openai.chat.completions.create(apiParams);

    let fullContent = "";
    let totalTokens = { prompt: 0, completion: 0, total: 0 };
    let toolCalls = [];

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      const content = delta?.content || "";
      if (content) {
        fullContent += content;
        res.write(`data: ${JSON.stringify({ type: 'content', content })}\n\n`);
      }

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
            } else if (toolCallDelta.function?.arguments) {
              toolCalls[toolCallDelta.index].function.arguments += toolCallDelta.function.arguments;
            }
          }
        }
      }

      if (chunk.choices[0]?.finish_reason) {
        const finishReason = chunk.choices[0].finish_reason;

        if (finishReason === 'tool_calls' && toolCalls.length > 0) {
          res.write(`data: ${JSON.stringify({ type: 'function_call', message: 'Searching the web...' })}\n\n`);

          messagesWithSystem.push({
            role: 'assistant',
            content: null,
            tool_calls: toolCalls
          });

          for (const toolCall of toolCalls) {
            if (toolCall.function.name === 'web_search') {
              try {
                const args = JSON.parse(toolCall.function.arguments);
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
                  content: `Search results for "${args.query}":\n\n${resultsText}`
                });
              } catch (error) {
                console.error("Web search error:", error);
                messagesWithSystem.push({
                  role: "tool",
                  tool_call_id: toolCall.id,
                  content: `Error performing web search: ${error.message}`
                });
              }
            }
          }

          const followUpParams = {
            model,
            messages: messagesWithSystem,
            stream: true
          };

          if (!isRestrictedModel) {
            followUpParams.temperature = 0.7;
            followUpParams.max_tokens = maxTokens || 8000;
          } else {
            followUpParams.max_completion_tokens = maxTokens || 4000;
          }

          if (!openai) {
            res.write(`data: ${JSON.stringify({ error: "OpenAI client not initialized" })}\n\n`);
            res.end();
            return;
          }

          const followUpStream = await openai.chat.completions.create(followUpParams);

          fullContent = '';

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
                  total: followUpChunk.usage.total_tokens || 0
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
          if (chunk.usage) {
            totalTokens = {
              prompt: chunk.usage.prompt_tokens || 0,
              completion: chunk.usage.completion_tokens || 0,
              total: chunk.usage.total_tokens || 0
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
// CHAT CONVERSATION MANAGEMENT
// ============================================

app.get("/api/conversations", (_req, res) => {
  const store = readDb();
  res.json(store.conversations || []);
});

app.get("/api/conversations/:id", (req, res) => {
  const store = readDb();
  const conversation = store.conversations?.find(c => c.id === req.params.id);
  if (!conversation) {
    return res.status(404).json({ error: "Conversation not found" });
  }
  res.json(conversation);
});

app.post("/api/conversations", (req, res) => {
  const store = readDb();
  if (!Array.isArray(store.conversations)) store.conversations = [];

  const conversation = {
    id: `conv_${Date.now()}`,
    title: req.body.title || "New Conversation",
    messages: req.body.messages || [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  store.conversations.unshift(conversation);
  if (!writeDb(store)) return res.status(500).json({ error: "Failed to save" });
  res.json(conversation);
});

app.put("/api/conversations/:id", (req, res) => {
  const store = readDb();
  if (!Array.isArray(store.conversations)) store.conversations = [];

  const index = store.conversations.findIndex(c => c.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: "Conversation not found" });
  }

  store.conversations[index] = {
    ...store.conversations[index],
    ...req.body,
    updatedAt: new Date().toISOString()
  };

  if (!writeDb(store)) return res.status(500).json({ error: "Failed to save" });
  res.json(store.conversations[index]);
});

app.delete("/api/conversations/:id", (req, res) => {
  const store = readDb();
  if (!Array.isArray(store.conversations)) store.conversations = [];

  const index = store.conversations.findIndex(c => c.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: "Conversation not found" });
  }

  store.conversations.splice(index, 1);
  if (!writeDb(store)) return res.status(500).json({ error: "Failed to delete" });
  res.status(204).end();
});

// Color palette routes
app.get("/color-palettes", authenticateToken, async (req, res) => {
  try {
    const mode = req.query.mode;
    if (mode && mode !== "light" && mode !== "dark") {
      return res.status(400).json({ error: "Invalid mode" });
    }

    const userId = req.user.id;

    if (db.isPostgres()) {
      // Fetch user-specific palettes from Postgres
      const result = await db.query(
        'SELECT * FROM user_palettes WHERE user_id = $1',
        [userId]
      );
      let palettes = result.rows;

      // If no palettes, create defaults
      if (palettes.length === 0) {
        const defaults = DEFAULT_PALETTES.map(p => ({
          ...p,
          user_id: userId
        }));
        
        for (const p of defaults) {
          await db.query(
            `INSERT INTO user_palettes (user_id, name, mode, colors, typography, is_active)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [p.user_id, p.name, p.mode, JSON.stringify(p.colors), JSON.stringify(p.typography), p.is_active]
          );
        }
        
        const newResult = await db.query('SELECT * FROM user_palettes WHERE user_id = $1', [userId]);
        palettes = newResult.rows;
      }

      const filtered = mode ? palettes.filter(p => p.mode === mode) : palettes;
      return res.json(filtered);
    }

    const dbData = readDb();
    const user = dbData.users.find(u => u.id === userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (!user.palettes) {
      user.palettes = DEFAULT_PALETTES.map(p => ({ ...p }));
      writeDb(dbData);
    }

    const palettes = mode
      ? user.palettes.filter(p => p.mode === mode)
      : user.palettes;
    res.json(palettes);
  } catch (error) {
    console.error("Error fetching color palettes:", error);
    res.status(500).json({ error: "Failed to fetch color palettes" });
  }
});

app.get("/color-palettes/active", authenticateToken, async (req, res) => {
  try {
    const mode = req.query.mode;
    if (mode && mode !== "light" && mode !== "dark") {
      return res.status(400).json({ error: "Invalid mode" });
    }

    const userId = req.user.id;

    if (db.isPostgres()) {
      // Ensure palettes exist
      const check = await db.query('SELECT 1 FROM user_palettes WHERE user_id = $1', [userId]);
      if (check.rows.length === 0) {
         const defaults = DEFAULT_PALETTES.map(p => ({ ...p, user_id: userId }));
         for (const p of defaults) {
          await db.query(
            `INSERT INTO user_palettes (user_id, name, mode, colors, typography, is_active)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [p.user_id, p.name, p.mode, JSON.stringify(p.colors), JSON.stringify(p.typography), p.is_active]
          );
        }
      }

      if (mode) {
        const result = await db.query(
          'SELECT * FROM user_palettes WHERE user_id = $1 AND mode = $2 AND is_active = true',
          [userId, mode]
        );
        const palette = result.rows[0];
        if (!palette) return res.status(404).json({ error: "Active palette not found" });
        return res.json(palette);
      }
      
      const result = await db.query(
        'SELECT * FROM user_palettes WHERE user_id = $1 AND is_active = true',
        [userId]
      );
      const palettes = result.rows;
      
      const response = {
        light: palettes.find(p => p.mode === "light") || null,
        dark: palettes.find(p => p.mode === "dark") || null
      };
      return res.json(response);
    }

    const dbData = readDb();
    const user = dbData.users.find(u => u.id === userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (!user.palettes) {
      user.palettes = DEFAULT_PALETTES.map(p => ({ ...p }));
      writeDb(dbData);
    }

    if (mode) {
      const palette = user.palettes.find(p => p.mode === mode && p.is_active);
      if (!palette) return res.status(404).json({ error: "Active palette not found" });
      return res.json(palette);
    }

    const response = {
      light: user.palettes.find(p => p.mode === "light" && p.is_active) || null,
      dark: user.palettes.find(p => p.mode === "dark" && p.is_active) || null
    };
    res.json(response);
  } catch (error) {
    console.error("Error fetching active color palettes:", error);
    res.status(500).json({ error: "Failed to fetch active color palettes" });
  }
});

app.post("/color-palettes", authenticateToken, async (req, res) => {
  try {
    const { payload, errors } = sanitizePalettePayload(req.body, { partial: false, allowMode: true });
    if (errors.length) {
      return res.status(400).json({ error: "Invalid payload", details: errors });
    }

    const userId = req.user.id;

    if (db.isPostgres()) {
      // Deactivate other palettes of same mode for this user
      if (payload.is_active) {
        await db.query(
          'UPDATE user_palettes SET is_active = false WHERE user_id = $1 AND mode = $2',
          [userId, payload.mode]
        );
      }

      const result = await db.query(
        `INSERT INTO user_palettes (user_id, name, mode, colors, typography, is_active)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [userId, payload.name, payload.mode, JSON.stringify(payload.colors), JSON.stringify(payload.typography), payload.is_active]
      );
      
      return res.status(201).json(result.rows[0]);
    }

    const dbData = readDb();
    const user = dbData.users.find(u => u.id === userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (!user.palettes) {
      user.palettes = DEFAULT_PALETTES.map(p => ({ ...p }));
    }

    const newId = getNextPaletteId(user.palettes);
    const newPalette = {
      id: newId,
      ...payload
    };

    if (newPalette.is_active) {
      user.palettes.forEach(palette => {
        if (palette.mode === newPalette.mode) {
          palette.is_active = false;
        }
      });
    }

    user.palettes.push(newPalette);
    // ensureFilePalettes(dbData); // No longer needed for global palettes

    if (!writeDb(dbData)) {
      return res.status(500).json({ error: "Failed to persist palette" });
    }

    const stored = user.palettes.find(p => p.id === newId) || newPalette;
    res.status(201).json(stored);
  } catch (error) {
    console.error("Error creating color palette:", error);
    res.status(500).json({ error: "Failed to create color palette" });
  }
});

app.put("/color-palettes/:id", authenticateToken, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: "Invalid id" });
    }

    const { payload, errors } = sanitizePalettePayload(req.body, { partial: true, allowMode: false });
    if (errors.length) {
      return res.status(400).json({ error: "Invalid payload", details: errors });
    }

    const userId = req.user.id;

    if (db.isPostgres()) {
      // Verify ownership
      const check = await db.query('SELECT * FROM user_palettes WHERE id = $1 AND user_id = $2', [id, userId]);
      if (check.rows.length === 0) {
        return res.status(404).json({ error: "Palette not found" });
      }
      const current = check.rows[0];

      if (payload.is_active) {
        await db.query(
          'UPDATE user_palettes SET is_active = false WHERE user_id = $1 AND mode = $2',
          [userId, current.mode]
        );
      }

      // Build dynamic update query
      const updates = [];
      const values = [];
      let idx = 1;

      if (payload.name) { updates.push(`name = $${idx++}`); values.push(payload.name); }
      if (payload.colors) { updates.push(`colors = $${idx++}`); values.push(JSON.stringify(payload.colors)); }
      if (payload.typography) { updates.push(`typography = $${idx++}`); values.push(JSON.stringify(payload.typography)); }
      if (payload.is_active !== undefined) { updates.push(`is_active = $${idx++}`); values.push(payload.is_active); }
      
      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      values.push(id);
      values.push(userId);

      const result = await db.query(
        `UPDATE user_palettes SET ${updates.join(', ')} WHERE id = $${idx++} AND user_id = $${idx++} RETURNING *`,
        values
      );

      return res.json(result.rows[0]);
    }

    const dbData = readDb();
    const user = dbData.users.find(u => u.id === userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (!user.palettes) user.palettes = DEFAULT_PALETTES.map(p => ({ ...p }));

    const palette = user.palettes.find(p => p.id === id);
    if (!palette) {
      return res.status(404).json({ error: "Palette not found" });
    }

    if (payload.name) palette.name = payload.name;
    if (payload.colors) palette.colors = payload.colors;
    if (payload.typography) palette.typography = payload.typography;
    if (payload.is_active !== undefined) {
      palette.is_active = payload.is_active;
      if (payload.is_active) {
        user.palettes.forEach(item => {
          if (item.mode === palette.mode && item.id !== palette.id) {
            item.is_active = false;
          }
        });
      }
    }

    // ensureFilePalettes(dbData); // No longer needed

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
    const user = dbData.users.find(u => u.id === userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (!user.palettes) user.palettes = DEFAULT_PALETTES.map(p => ({ ...p }));

    const activated = setActivePaletteInStore(user.palettes, id);
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
    const user = dbData.users.find(u => u.id === userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (!user.palettes) user.palettes = DEFAULT_PALETTES.map(p => ({ ...p }));

    const removed = removePaletteFromStore(user.palettes, id);
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

const respondUnsupportedEntity = (res) => res.status(400).json({ error: "Documents are only available for clients, partners, and tipers" });

const ensureParentRecord = async (entity, entityId) => {
  if (!isDocumentEntity(entity)) {
    return { ok: false, status: 400, message: "Unsupported entity" };
  }

  if (db.isPostgres()) {
    const record = await db.getById(entity, entityId);
    return record ? { ok: true } : { ok: false, status: 404, message: "Parent record not found" };
  }

  const store = readDb();
  const collection = Array.isArray(store[entity]) ? store[entity] : [];
  const exists = collection.some((item) => Number(item.id) === entityId);
  return exists ? { ok: true, store } : { ok: false, status: 404, message: "Parent record not found" };
};

app.get("/:entity/:id/documents", async (req, res) => {
  const entity = req.params.entity;
  const entityId = Number(req.params.id);

  if (!isDocumentEntity(entity)) {
    return respondUnsupportedEntity(res);
  }

  if (Number.isNaN(entityId)) {
    return res.status(400).json({ error: "Invalid entity id" });
  }

  try {
    if (db.isPostgres()) {
      const docs = await db.getDocuments(entity, entityId);
      return res.json(docs ?? []);
    }

    const store = readDb();
    ensureDocumentsCollection(store);
    const docs = store.documents
      .filter((doc) => doc.entityType === entity && Number(doc.entityId) === entityId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((doc) => stripDocumentData(doc));
    return res.json(docs);
  } catch (error) {
    console.error(`Error fetching ${entity} documents:`, error);
    res.status(500).json({ error: "Failed to fetch documents" });
  }
});

app.post("/:entity/:id/documents", upload.single("file"), async (req, res) => {
  const entity = req.params.entity;
  const entityId = Number(req.params.id);

  if (!isDocumentEntity(entity)) {
    return respondUnsupportedEntity(res);
  }

  if (Number.isNaN(entityId)) {
    return res.status(400).json({ error: "Invalid entity id" });
  }

  if (!req.file) {
    return res.status(400).json({ error: "Soubor nebyl odeslán" });
  }

  try {
    const { ok, status, message, store } = await ensureParentRecord(entity, entityId);
    if (!ok) {
      return res.status(status).json({ error: message });
    }

    const filename = sanitizeFilename(req.file.originalname);
    const mimeType = req.file.mimetype || "application/octet-stream";
    const sizeBytes = req.file.size;

    if (db.isPostgres()) {
      const created = await db.createDocument(entity, entityId, {
        filename,
        mimeType,
        sizeBytes,
        buffer: req.file.buffer
      });
      return res.status(201).json(created);
    }

    const entry = {
      id: nextDocumentId(store),
      entityType: entity,
      entityId,
      filename,
      mimeType,
      sizeBytes,
      createdAt: new Date().toISOString(),
      data: req.file.buffer.toString("base64")
    };
    ensureDocumentsCollection(store);
    store.documents.push(entry);
    if (!writeDb(store)) {
      return res.status(500).json({ error: "Failed to persist document" });
    }
    return res.status(201).json(stripDocumentData(entry));
  } catch (error) {
    console.error(`Error uploading document for ${entity}:`, error);
    res.status(500).json({ error: "Failed to upload document" });
  }
});

app.delete("/documents/:documentId", async (req, res) => {
  const documentId = Number(req.params.documentId);
  if (Number.isNaN(documentId)) {
    return res.status(400).json({ error: "Invalid document id" });
  }

  try {
    if (db.isPostgres()) {
      const deleted = await db.deleteDocument(documentId);
      if (!deleted) {
        return res.status(404).json({ error: "Document not found" });
      }
      return res.json(deleted);
    }

    const store = readDb();
    const removed = removeDocumentFromStore(store, documentId);
    if (!removed) {
      return res.status(404).json({ error: "Document not found" });
    }
    if (!writeDb(store)) {
      return res.status(500).json({ error: "Failed to persist document removal" });
    }
    return res.json(stripDocumentData(removed));
  } catch (error) {
    console.error("Error deleting document:", error);
    res.status(500).json({ error: "Failed to delete document" });
  }
});

app.get("/documents/:documentId/download", async (req, res) => {
  const documentId = Number(req.params.documentId);
  if (Number.isNaN(documentId)) {
    return res.status(400).json({ error: "Invalid document id" });
  }

  try {
    if (db.isPostgres()) {
      const doc = await db.getDocumentById(documentId, { includeData: true });
      if (!doc || !doc.data) {
        return res.status(404).json({ error: "Document not found" });
      }
      const buffer = Buffer.isBuffer(doc.data) ? doc.data : Buffer.from(doc.data);
      res.setHeader("Content-Type", doc.mimeType || "application/octet-stream");
      res.setHeader("Content-Length", buffer.length);
      res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(doc.filename)}"`);
      return res.send(buffer);
    }

    const store = readDb();
    const doc = findDocumentInStore(store, documentId);
    if (!doc) {
      return res.status(404).json({ error: "Document not found" });
    }
    const buffer = Buffer.from(doc.data || "", "base64");
    res.setHeader("Content-Type", doc.mimeType || "application/octet-stream");
    res.setHeader("Content-Length", buffer.length);
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(doc.filename)}"`);
    return res.send(buffer);
  } catch (error) {
    console.error("Error downloading document:", error);
    res.status(500).json({ error: "Failed to download document" });
  }
});

// AUTH ROUTES
app.post("/auth/login", async (req, res) => {
  const { username, password } = req.body;
  
  try {
    const result = await db.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Compare hashed password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Generate Token
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: "8h" }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/auth/register", async (req, res) => {
  const { username, password, role } = req.body;
  
  try {
    const check = await db.query('SELECT id FROM users WHERE username = $1', [username]);
    if (check.rows.length > 0) {
      return res.status(400).json({ error: "User already exists" });
    }

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    const result = await db.query(
      'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING id',
      [username, password_hash, role || 'employee']
    );

    res.status(201).json({ message: "User created", userId: result.rows[0].id });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// CRUD for users
app.get("/users", async (req, res) => {
  try {
    if (db.isPostgres()) {
      const users = await db.getAll('users');
      return res.json(users);
    }

    const dbData = readDb();
    res.json(dbData.users || []);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

app.get("/users/:id", async (req, res) => {
  const userId = req.params.id;

  try {
    if (db.isPostgres()) {
      const result = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
      const user = result.rows[0];
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      return res.json(user);
    }

    const dbData = readDb();
    const user = dbData.users?.find(u => u.id === userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json(user);
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

app.post("/users", async (req, res) => {
  const { username, password, role } = req.body;

  try {
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    if (db.isPostgres()) {
      const result = await db.query(
        'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3) RETURNING *',
        [username, password_hash, role || 'employee']
      );
      return res.status(201).json(result.rows[0]);
    }

    const dbData = readDb();
    const newId = dbData.users.reduce((max, user) => Math.max(max, Number(user.id)), 0) + 1;
    const newUser = { id: newId, username, password_hash, role: role || 'employee' };
    dbData.users.push(newUser);
    if (!writeDb(dbData)) {
      return res.status(500).json({ error: "Failed to persist user" });
    }
    res.status(201).json(newUser);
  } catch (error) {
    console.error("Error creating user:", error);
    res.status(500).json({ error: "Failed to create user" });
  }
});

app.put("/users/:id", async (req, res) => {
  const userId = req.params.id;
  const { username, password, role } = req.body;

  try {
    if (db.isPostgres()) {
      const updates = [];
      const params = [];

      if (username !== undefined) {
        updates.push('username = $' + (params.length + 1));
        params.push(username);
      }

      if (password !== undefined) {
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);
        updates.push('password_hash = $' + (params.length + 1));
        params.push(password_hash);
      }

      if (role !== undefined) {
        updates.push('role = $' + (params.length + 1));
        params.push(role);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: "No valid fields to update" });
      }

      const result = await db.query(
        'UPDATE users SET ' + updates.join(', ') + ' WHERE id = $' + (params.length + 1) + ' RETURNING *',
        [...params, userId]
      );

      const user = result.rows[0];
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      return res.json(user);
    }

    const dbData = readDb();
    const user = dbData.users.find(u => u.id === userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (username !== undefined) user.username = username;
    if (password !== undefined) {
      const salt = await bcrypt.genSalt(10);
      user.password_hash = await bcrypt.hash(password, salt);
    }
    if (role !== undefined) user.role = role;

    if (!writeDb(dbData)) {
      return res.status(500).json({ error: "Failed to persist user" });
    }
    res.json(user);
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ error: "Failed to update user" });
  }
});

app.delete("/users/:id", async (req, res) => {
  const userId = req.params.id;

  try {
    if (db.isPostgres()) {
      const result = await db.query('DELETE FROM users WHERE id = $1 RETURNING *', [userId]);
      const user = result.rows[0];
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      return res.json(user);
    }

    const dbData = readDb();
    const idx = dbData.users.findIndex(u => u.id === userId);
    if (idx === -1) {
      return res.status(404).json({ error: "User not found" });
    }
    const [deleted] = dbData.users.splice(idx, 1);
    if (!writeDb(dbData)) {
      return res.status(500).json({ error: "Failed to persist user removal" });
    }
    res.json(deleted);
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ error: "Failed to delete user" });
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

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: `File is too large. Maximum size is ${Math.round(MAX_DOCUMENT_SIZE_BYTES / (1024 * 1024))} MB.` });
    }
    return res.status(400).json({ error: err.message });
  }

  console.error('Unhandled server error:', err);
  return res.status(500).json({ error: 'Unexpected server error' });
});

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
