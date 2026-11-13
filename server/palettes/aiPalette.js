// Motivy › "AI návrh": Claude proposes a colour theme (7 colours, 3 fonts)
// from a description, a logo and/or a web address, or adjusts an existing
// theme ("base") the way the description asks ("tmavší", "teplejší akcent").
// Nothing is saved here; the screen opens the proposal as a new palette
// draft the user edits and saves.
//
// A web address is read by this server (siteColors.js, with an SSRF guard):
// its real colours and fonts go to Claude as text. When the site cannot be
// read that way, Anthropic's web_fetch reads the page instead (text only).
// Every call is logged with recordAiUsage (feature 'palette_ai').

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import multer from 'multer';
import { z } from 'zod/v4';
import { recordAiUsage } from '../finance/usage.js';
import { describeSiteStyle, readSiteStyle, SiteFetchError } from './siteColors.js';
import { reenterRequestContext } from '../safety/context.js';

const MODEL = process.env.PALETTE_AI_MODEL || 'claude-sonnet-5-5';
const HOURLY_LIMIT = Number(process.env.PALETTE_AI_HOURLY_LIMIT) || 20;
const MAX_LOGO_BYTES = 4 * 1024 * 1024;
const LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

// The fonts the palette form offers (FONT_SUGGESTIONS in
// client/src/theme/PaletteManager.tsx); keep the two lists the same.
export const FONT_CHOICES = Object.freeze([
  "'Inter', system-ui, sans-serif",
  "'Poppins', 'Segoe UI', sans-serif",
  "'Manrope', 'Segoe UI', system-ui, sans-serif",
  "'Nunito Sans', 'Segoe UI', sans-serif",
  "'Work Sans', 'Segoe UI', sans-serif",
  "'Source Sans Pro', 'Segoe UI', sans-serif",
  "'Montserrat', 'Segoe UI', sans-serif",
  "'Raleway', 'Segoe UI', sans-serif",
]);

const COLOR_KEYS = ['primary', 'accent', 'background', 'surface', 'text', 'muted', 'border'];
const Font = z.enum(FONT_CHOICES);
const Proposal = z.object({
  name: z.string().describe('Krátký český název motivu, nejvýše 40 znaků.'),
  colors: z.object(Object.fromEntries(COLOR_KEYS.map((key) => [key, z.string().describe('Barva jako #rrggbb')]))),
  typography: z.object({ heading: Font, subheading: Font, body: Font }),
  note: z.string().describe('Jedna až dvě české věty: z čeho motiv vychází a proč tyto barvy.'),
});

const SYSTEM = `You design colour themes for Walter System, a Czech CRM web app: a side menu, data tables, profile panels, cards, buttons and badges.

A theme is seven colours, each as #rrggbb:
- primary: buttons, active menu items, links, focus rings
- accent: secondary highlights and badges
- background: the page behind everything
- surface: cards, panels, tables and the menu
- text: main text
- muted: secondary text, labels, metadata
- border: lines and dividers

Rules:
- Light mode: light background and surface, dark text. Dark mode: dark background and surface, light text.
- Contrast (WCAG): text on background and on surface at least 7:1; muted on surface at least 4.5:1; primary against surface at least 3:1; border visible against surface but quiet.
- background and surface close to each other but distinguishable.
- Fonts: only from the allowed list; heading and subheading may differ from body.
- If a logo is attached, build the theme around its brand colours (primary usually the main brand colour, adjusted for contrast).
- If styles read from the website are given, build the theme from them: primary from the brand colour the site uses most (or its theme-color / a --primary or --brand variable), accent from its second brand colour, neutrals in the site's spirit; fonts: the allowed fonts closest to the site's. Say in the note which site colours you used.
- If only a web address is given (no styles), fetch the page with web_fetch and use the site's brand colours (theme-color, CSS custom properties, buttons, logo). If it cannot be read, say so in the note and work from the rest.
- The name and the note are in Czech.

When an existing theme is given to adjust:
- Change only what the user asks for and keep the rest of its character: the same hues where the request does not touch them, the same fonts unless fonts are mentioned (if one of its fonts is not on the allowed list, use the closest allowed one).
- Still meet the contrast rules; if the requested change would break them, get as close as the rules allow and say so in the note.
- The name is the original name with a short hint of the change; the note says what changed.`;

// ---- Contrast -------------------------------------------------------------

const HEX = /^#[0-9a-f]{6}$/i;

const luminance = (hex) => {
  const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
  const [r, g, b] = channels.map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const contrast = (left, right) => {
  const [lighter, darker] = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
};

/** What is wrong with a proposal, in Czech (empty when it is usable). */
export const checkProposal = (proposal, mode) => {
  const problems = [];
  const colors = proposal?.colors ?? {};
  const bad = COLOR_KEYS.filter((key) => !HEX.test(String(colors[key] ?? '')));
  if (bad.length) return [`Neplatný zápis barev: ${bad.join(', ')} (má být #rrggbb).`];
  const pairs = [
    ['text', 'background', 4.5, 'Text na pozadí'],
    ['text', 'surface', 4.5, 'Text na kartách'],
    ['muted', 'surface', 3, 'Doplňkový text na kartách'],
    ['primary', 'surface', 3, 'Primární barva na kartách'],
  ];
  for (const [front, back, minimum, label] of pairs) {
    const ratio = contrast(colors[front], colors[back]);
    if (ratio < minimum) problems.push(`${label} má kontrast ${ratio.toFixed(1)}:1, potřeba aspoň ${minimum}:1.`);
  }
  const bright = luminance(colors.background);
  if (mode === 'light' && bright < 0.5) problems.push('Pozadí je na světlý režim moc tmavé.');
  if (mode === 'dark' && bright > 0.2) problems.push('Pozadí je na tmavý režim moc světlé.');
  return problems;
};

// ---- The call -------------------------------------------------------------

let client = null;
const anthropic = () => {
  if (!client) client = new Anthropic();
  return client;
};

export class PaletteAiError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

const describeRequest = ({ description, website, mode, hasLogo, base, siteStyle }) =>
  [
    `Režim: ${mode === 'dark' ? 'tmavý (dark)' : 'světlý (light)'}.`,
    base ? `Uprav tento existující motiv:\n${JSON.stringify(base)}` : null,
    description ? `${base ? 'Požadovaná úprava' : 'Popis od uživatele'}: ${description}` : null,
    siteStyle ? describeSiteStyle(siteStyle) : website ? `Webová adresa značky: ${website}` : null,
    hasLogo ? 'Přiložené je logo značky.' : null,
    `Povolená písma: ${FONT_CHOICES.join(' | ')}`,
  ]
    .filter(Boolean)
    .join('\n');

async function askOnce({ content, website, userId, signal }) {
  const messages = [{ role: 'user', content }];
  // A long web fetch can pause the turn; it is sent back as it is to go on.
  for (let round = 0; round < 3; round += 1) {
    const response = await anthropic().messages.parse(
      {
        model: MODEL,
        max_tokens: 8000,
        system: SYSTEM,
        messages,
        ...(website ? { tools: [{ type: 'web_fetch_20250910', name: 'web_fetch', max_uses: 3 }] } : {}),
        output_config: { format: zodOutputFormat(Proposal), effort: 'low' },
      },
      { signal }
    );
    recordAiUsage({
      provider: 'anthropic',
      model: response.model ?? MODEL,
      feature: 'palette_ai',
      userId,
      input: response.usage?.input_tokens,
      output: response.usage?.output_tokens,
      cacheRead: response.usage?.cache_read_input_tokens,
      cacheWrite: response.usage?.cache_creation_input_tokens,
    });
    if (response.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: response.content });
      continue;
    }
    if (response.stop_reason === 'refusal') throw new PaletteAiError('Návrh se nepodařilo vytvořit.', 422);
    if (!response.parsed_output) throw new PaletteAiError('AI nevrátila použitelný návrh. Zkuste to znovu.');
    return response.parsed_output;
  }
  throw new PaletteAiError('Načtení webu trvalo příliš dlouho. Zkuste to bez adresy nebo znovu.');
}

/**
 * description: free text; website: an http(s) address; logo: { data (Buffer),
 * mediaType }; mode: 'light' | 'dark'. Returns the proposal plus any contrast
 * problems that a second attempt did not fix (shown as warnings).
 */
export async function suggestPalette({ description, website, logo, mode, base = null, userId, signal }) {
  const content = [];
  if (logo) {
    content.push({ type: 'image', source: { type: 'base64', media_type: logo.mediaType, data: logo.data.toString('base64') } });
  }
  // The site's own colours and fonts, read here; web_fetch only as a fallback.
  let siteStyle = null;
  if (website) {
    try {
      siteStyle = await readSiteStyle(website, { signal });
    } catch (error) {
      if (!(error instanceof SiteFetchError)) console.warn('Palette AI: site style not read:', error?.message ?? error);
    }
  }
  content.push({ type: 'text', text: describeRequest({ description, website, mode, hasLogo: Boolean(logo), base, siteStyle }) });

  let proposal = await askOnce({ content, website: siteStyle ? null : website, userId, signal });
  let problems = checkProposal(proposal, mode);
  if (problems.length) {
    // One more try, told what to fix; the page is not fetched again.
    const retry = [
      ...content.filter((block) => block.type === 'image'),
      {
        type: 'text',
        text:
          `${describeRequest({ description, website: null, mode, hasLogo: Boolean(logo), base, siteStyle })}\n\n` +
          `Předchozí návrh:\n${JSON.stringify(proposal)}\n\nOprav tyto problémy a zachovej charakter návrhu:\n- ${problems.join('\n- ')}`,
      },
    ];
    const second = await askOnce({ content: retry, website: null, userId, signal });
    const secondProblems = checkProposal(second, mode);
    if (secondProblems.length <= problems.length) {
      proposal = second;
      problems = secondProblems;
    }
  }
  return { ...proposal, mode, warnings: problems, siteRead: Boolean(siteStyle) };
}

// ---- Route ----------------------------------------------------------------

const requestsByUser = new Map();
const underLimit = (userId) => {
  const now = Date.now();
  const recent = (requestsByUser.get(userId) ?? []).filter((at) => now - at < 3_600_000);
  if (recent.length >= HOURLY_LIMIT) return false;
  recent.push(now);
  requestsByUser.set(userId, recent);
  return true;
};

const Input = z.object({
  description: z.string().trim().max(1000).optional().default(''),
  website: z.string().trim().max(300).optional().default(''),
  mode: z.enum(['light', 'dark']),
  // The theme to adjust, as JSON (multipart sends text).
  base: z.string().max(4000).optional().default(''),
});

// A saved palette as the screen sends it; only what the prompt needs.
const BasePalette = z.object({
  name: z.string().trim().max(80),
  colors: z.object(Object.fromEntries(COLOR_KEYS.map((key) => [key, z.string().regex(HEX)]))),
  typography: z
    .object({ heading: z.string().max(120), subheading: z.string().max(120), body: z.string().max(120) })
    .partial()
    .optional(),
});

/** The base palette from the form, or null; undefined when it is malformed. */
export const parseBasePalette = (text) => {
  if (!text) return null;
  try {
    const parsed = BasePalette.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
};

export const normalizeWebsite = (value) => {
  if (!value) return '';
  // Another scheme (ftp://, javascript:, file:) is refused, not prefixed;
  // "example.com:8080" is a host with a port, not a scheme.
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) && !/^[^:/]+:\d+(\/|$)/.test(value);
  if (hasScheme && !/^https?:\/\//i.test(value)) return null;
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
};

export function registerPaletteAiRoutes(app, { authenticateToken }) {
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_LOGO_BYTES, files: 1 } }).single('logo');
  const readLogo = (req, res, next) =>
    upload(req, res, (error) => {
      if (!error) return next();
      res.status(400).json({
        error: error.code === 'LIMIT_FILE_SIZE' ? 'Logo je větší než 4 MB.' : 'Logo se nepodařilo přijmout.',
      });
    });

  app.post('/api/palettes/ai', authenticateToken, readLogo, reenterRequestContext, async (req, res) => {
    const parsed = Input.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'Neplatný požadavek.' });
    const { description, mode } = parsed.data;
    const website = normalizeWebsite(parsed.data.website);
    if (website === null) return res.status(400).json({ error: 'Webová adresa není platná.' });
    const base = parseBasePalette(parsed.data.base);
    if (base === undefined) return res.status(400).json({ error: 'Motiv k úpravě se nepodařilo přečíst.' });
    if (base && !description) return res.status(400).json({ error: 'Napište, co se má na motivu změnit.' });
    const file = req.file;
    if (file && !LOGO_TYPES.has(file.mimetype)) {
      return res.status(400).json({ error: 'Logo musí být obrázek PNG, JPEG, WebP nebo GIF.' });
    }
    if (!description && !website && !file) {
      return res.status(400).json({ error: 'Napište popis, přidejte logo nebo webovou adresu.' });
    }
    if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'AI není nastavená (chybí klíč).' });
    if (!underLimit(req.user?.id)) {
      return res.status(429).json({ error: `Za hodinu jde vytvořit nejvýše ${HOURLY_LIMIT} návrhů.` });
    }

    const controller = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) controller.abort();
    });
    try {
      const proposal = await suggestPalette({
        description,
        website,
        logo: file ? { data: file.buffer, mediaType: file.mimetype } : null,
        mode,
        base,
        userId: req.user?.id,
        signal: controller.signal,
      });
      res.json(proposal);
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof PaletteAiError) return res.status(error.status).json({ error: error.message });
      const credit = /credit balance/i.test(String(error?.message ?? ''));
      console.error('Palette AI failed:', error?.message ?? error);
      res.status(502).json({
        error: credit ? 'Na účtu Anthropic došel předplacený kredit.' : 'Návrh se nepodařilo vytvořit. Zkuste to znovu.',
      });
    }
  });
}
