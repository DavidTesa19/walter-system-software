# Walter System Software

## Tables: check the ag-Grid edition before building a feature

The client uses **ag-Grid Community** (`ag-grid-community` / `ag-grid-react`, see
`client/package.json`). Community is the free edition; a good number of the
table features that get asked for are **Enterprise-only**.

**Before implementing any new grid feature, first work out whether ag-Grid
Enterprise already provides it.** Do not quietly build a homegrown version of an
Enterprise feature — that is how this codebase ended up with fragile custom
layout code that broke every time something nearby changed.

Enterprise-only, at time of writing — treat this list as a prompt to check the
docs, not as the authority:

- Row grouping, aggregation, pivoting
- Master/detail (expandable sub-tables)
- Range selection, clipboard range copy/paste, fill handle
- Excel export (CSV export *is* Community)
- Set filter, multi filter, advanced filter
- Tool panels (columns panel, filters panel), the full context menu
- Server-side and viewport row models
- Status bar, sparklines, column/row grouping panel

When a request lands on one of these:

1. Say so explicitly, and name the Enterprise feature that covers it.
2. Give a rough estimate of the Community workaround: how much custom code, and
   what is likely to be fragile about it.
3. **Ask before building the workaround.** A licence may well be cheaper than
   the maintenance, and that is the user's call to make, not an assumption to
   make for them.

Enterprise is a drop-in on top of what is already here (add the package,
register the modules, set a licence key) — not a migration — so the switch is
cheap if the user wants it.

## Grid layout gotchas

These are load-bearing and easy to reintroduce:

- **Never mix `flex` on a column def with `api.sizeColumnsToFit()`.** They are
  two different sizing mechanisms that overwrite each other. `sizeColumnsToFit()`
  writes absolute widths and clears `flex`; a subsequent column rebuild restores
  `flex` and resets every width to ag-Grid's 200px default. The columns then
  oscillate between the two layouts, which reads to the user as "the values are
  under the wrong headings".
- **A new `columnDefs` array rebuilds every column and discards their widths.**
  The section components rebuild their defs whenever data, filters or user
  options change, so any sizing done imperatively must be redone on ag-Grid's
  `gridColumnsChanged` event. `useGridColumnLayout` handles this — use the hook
  rather than sizing columns ad hoc.
- The min widths on these grids add up to more than the viewport on a normal
  screen, so the subject tables are *expected* to scroll horizontally. Every
  column pinned to its own `minWidth` is the correct rendering, not a bug.
- **Never change a cell's `position` in CSS.** ag-Grid lays every `.ag-cell` out
  with `position: absolute` and an explicit `left`. A rule that sets
  `position: relative` on a cell — the usual reflex when anchoring an `::after`
  badge — drops exactly those cells back into normal flow, so they render at the
  wrong offset and paint over their neighbours. This was the cause of the
  "overlapping text" bug: only the rows carrying a change marker were affected,
  because only those cells got the class. An `::after` anchors fine to the cell
  as it is, since `position: absolute` is already a containing block.
- Prefer ag-Grid's own APIs (`ensureColumnVisible`, `getColumnState`,
  `sizeColumnsToFit`) over hand-computed pixel maths against ag-Grid's internal
  DOM. Its internals (`.ag-center-cols-container` height, the fake horizontal
  scrollbar) are managed by the grid, and CSS or JS that overrides them tends to
  break virtualization and row clipping in ways that are hard to trace.
- Keep `defaultColDef` referentially stable (a module constant or a `useMemo`).
  An inline object literal is a new identity on every render, which makes the
  grid redo column work it did not need to.

## Verifying grid changes locally

Grid changes are verifiable end to end; do it rather than guessing.

1. `preview_start` the `server` (port 3004) and `client` (port 5173) entries from
   `.claude/launch.json`.
2. The JSON store is **`server/data/db.json`** (not `server/db.json`), and it is
   **untracked**, so a throwaway login cannot leak into a commit. Create one with
   `node server/create-user.js <name> <pass> Admin`, then restart the server so
   it picks the user up.
3. The login form is a controlled React form, so setting `input.value` directly
   does not update it. Use the native setter plus an `input` event, then
   `form.requestSubmit()`:
   `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el, v); el.dispatchEvent(new Event('input',{bubbles:true}))`
4. ag-Grid virtualizes columns, so measuring header cells in the DOM undercounts.
   Reach the grid API through the React fiber on `.ag-root-wrapper` (walk
   `.return` until `stateNode.api.getColumnState` exists) and measure via
   `getColumnState()` instead.
5. `server.js` has no hot reload — restart it after server edits, or new columns
   are silently dropped by stale field whitelists.

## Change log, backups and safety guards (`server/safety/`)

Overview and operator docs: `SAFETY_AND_BACKUPS.md`. The rules that are easy to
break from code:

- **`server/.env`'s `DATABASE_URL` is the production database.** Never run
  `server-postgres.js`, a migration or a script that writes with it locally.
  Test Postgres changes against a throwaway local Postgres instead (see below).
- Every write is logged by the `walter_audit` trigger, which reads the actor
  from the `walter.ctx` session setting. `installDbContextHook` (db.js) sets it
  on every pool checkout from the request's AsyncLocalStorage context. Do not
  bypass the pool with a separate `pg.Client` in request code, or the change is
  logged as `system`.
- Middleware that resumes the chain from a stream event (multer) loses the
  async context: follow `upload.single(...)` with `reenterRequestContext`, or
  uploads are logged without their user.
- New tables are logged and guarded automatically on the next boot. Only add a
  table to `AUDIT_EXCLUDED_TABLES` (tables.js) for telemetry or per-user UI
  state, and say why.
- The database refuses `TRUNCATE`, `DROP TABLE`/`DROP COLUMN` in `public`, and
  one statement deleting more than 20 rows of business data (cascades are
  fine). A migration that really needs one of these sets the escape hatch for
  its own transaction only: `SET LOCAL walter.allow_drop = on`
  (`allow_truncate`, `allow_mass_delete`). Never use `walter.suppress_audit`
  in app code.
- Restores and reverts match rows by primary key and write through
  `jsonb_populate_record(set)`, so column types round-trip. A new table with no
  primary key cannot be restored; give it one.
- The JSON dev backend (`server.js`) has no change log or backups; its
  `/api/safety/*` routes answer "unavailable" on purpose.

### Verifying safety changes locally

Postgres binaries come from the `embedded-postgres` npm package. On Windows
its `initdb` fails on the 260-character path limit when installed deep in a
temp folder; copy `node_modules/@embedded-postgres/windows-x64/native` to a
short path and run `bin/initdb.exe` / `bin/pg_ctl.exe` directly. To run the
real `server-postgres.js` against it, start it from a wrapper that sets
`DATABASE_URL` to the local database and `process.chdir`s away from `server/`
first, so `server/.env` is never loaded. A throwaway S3 is easy to mock with a
small HTTP server (path-style PUT/GET/HEAD/DELETE and `list-type=2`).

## IČO (company registration number)

Every subject (client / partner / tipař, all three sections) has an `ico`
column: 8 digits, the last a mod-11 check digit. `client/src/usersGrid/ico.ts`
validates and normalises it (spaces dropped, short numbers padded with
leading zeros); only a valid IČO is saved — from the profile panel and create
form (`IcoField.tsx`, field type `"ico"`), the grid column, and on create.
The server does not validate it. Under the number, the profile shows what
ARES says about it, through `GET /api/ares/ico/:ico` (`server/ares.js`, the
same module Jarvis's `company_registry` uses). IČO is shared across a
subject's sections and roles (`section-linking.js`, `SUBJECT_SHARED_FIELDS`).
A new subject field like this one needs: the ALTER in `db.js` (all nine
entity tables), the public-table INSERTs and the commission joins
(`e.x as e_x` / `entity_x`), the six `entityFields` lists in each server, the
JSON helpers in `entity-commission-json.js`, and on the client the section's
API types, normalisers, `mapXEntityUpdates`, row mirrors and `entitySync.ts`.

## Finance overview (`server/finance/`, Analýza › Finance)

Admin-only screen (`FinanceView.tsx`, `client/src/finance/`) listing everything
the app costs, each line marked **Napojeno** (number from the provider),
**Pevná cena** (confirmed from an invoice) or **Nepotvrzeno** (estimate).
Data (`server/finance/store.js`, Postgres or `server/data/finance.json`):

- **`finance_expenses`** — the cost list admins edit. `catalog.js` lists every
  service found in the code with an estimated price; the screen offers to
  import the missing ones. A new paid service or API key belongs in `CATALOG`,
  with its env var names (names only — the API reports set/unset, never values)
  and `costSource` if a connector can read its bills.
- **`finance_provider_costs`** — real bills per day and line item, **in the
  provider's own currency** (`amount` + `currency`; Google may bill in CZK).
  Connectors in `providers.js`, each with its own read-only credential:
  Anthropic `cost_report` (`ANTHROPIC_ADMIN_KEY`, organisations only, not an
  "Individual Org"), OpenAI `organization/costs` (`OPENAI_ADMIN_KEY`), Railway
  GraphQL invoices + open period (`RAILWAY_API_TOKEN`, an account token;
  invoice `total` is in cents with VAT), Cloudflare `billable-usage`
  (`CLOUDFLARE_API_TOKEN` with Billing Read + `CLOUDFLARE_ACCOUNT_ID`), Google
  Cloud via the BigQuery billing export (`google-billing.js`,
  `GOOGLE_BILLING_SERVICE_ACCOUNT` + `GOOGLE_BILLING_EXPORT_TABLE`; signs its
  own JWT, no Google library). Re-read when the screen opens if older than
  3 h; the first successful read takes 12 months. One provider's bill is
  counted once even when several cost lines point to it (Railway plan + usage).
- **`finance_state`** — cached documents: each connector's last sync and open
  period, the Brave quota (read from the `X-RateLimit-*` headers of every
  search, `recordBraveQuota`), the Brevo plan (`/v3/account`) and domain
  expiry from public RDAP (`checks.js`; `rdap.nic.cz` for .cz). The screen
  warns when a domain is within 30 days of expiry or already expired.
- **`finance_ai_usage`** — one row per AI call, priced by `pricing.js`. **Every
  new call to Anthropic, OpenAI or Brave must call `recordAiUsage`**
  (`finance/usage.js`; fire-and-forget, never throws). It breaks costs down per
  feature; once a provider is connected its bill replaces the estimate.

The telemetry tables (`finance_ai_usage`, `finance_provider_costs`,
`finance_state`) are in `AUDIT_EXCLUDED_TABLES`; `finance_expenses` is logged.
CZK conversion uses ČNB's daily fixing (`rates.js`, fixed fallback). To test
a connector locally, pass its token as an env var to a wrapper around
`server.js` — never write tokens into tracked files.

## Jarvis, the AI agent (`server/jarvis/`, `client/src/jarvis/`)

Claude (model `JARVIS_MODEL`, default `claude-opus-5-5`; effort `JARVIS_EFFORT`,
default `medium`) behind a manual streaming tool loop (`agent.js`), relayed to
the browser as Server-Sent Events from `POST /api/jarvis/chat`. The panel opens
from a floating launcher in the bottom-right corner or Alt+J; the launcher sits
above the footer, or above the message box on Týmový chat / AI Asistent, whose
send buttons are in that corner (`launcherPlacement` in App.tsx). Jarvis's CSS
names its own sans-serif font — nothing above it sets a body font, so an
inherited one falls back to the browser's serif. Needs `ANTHROPIC_API_KEY`;
`JARVIS_HOURLY_LIMIT` caps turns per user (default 60).

- **Tools never touch the database.** They call this server's own HTTP API
  (`api.js`) with a 15-minute token carrying the user's claims plus
  `actorType: 'ai_agent'`. Section access, role checks, business logic (deal
  sync, section links, archive cascades) and the change log's AI-agent
  tagging all come from the existing routes. Keep it that way when adding
  write tools: a direct SQL write would bypass all of it.
- **The system prompt (`prompt.js`) and the tool list stay byte-identical
  between requests.** They are the cached prefix, and Claude's earlier thinking
  blocks are only valid while that prefix matches. Anything that varies (date,
  user, current screen) goes into the `<kontext>` block of the user message
  (`buildContextBlock` in routes.js). Changing the prompt or tools between
  deploys is fine — `block_binding: drop_block` drops stale thinking instead of
  failing old conversations.
- **`jarvis_conversations.messages` is append-only**: an assistant message is
  stored together with its tool results, never edited afterwards. The panel
  renders the separate `transcript`.
- Tool inputs are validated with zod (`zod/v4`) before running; a tool failure
  goes back to the model as an `is_error` result, never as an exception.
- To try it locally, the JSON dev server works too (conversations go to
  `server/data/jarvis-conversations.json`). Live calls spend real Anthropic
  credits.
- **Calendar** (`calendar` tool): the user's own events plus zakázka deadlines
  in a range. Day boundaries and output are Prague time whatever the server's
  zone (UTC on Railway). The event form saves zone-less "2026-10-20T10:00",
  which means Prague time — parse it with `parseEventTime`, never `new Date()`
  alone, or every meeting shifts by the UTC offset. An all-day event's stored
  end is the day after its last day.
- **Calendar changes** (`calendar_add_event`, `calendar_update_event`,
  `calendar_delete_event`, `server/jarvis/calendarActions.js`): additions and
  edits happen at once and leave a card with "Vrátit zpět"; a deletion only
  happens on the card's "Smazat" and can be restored. Undo and delete refuse
  when the event no longer matches the card's snapshot (`sameEvent`), so the
  user's own later edit is never overwritten. At most 10 additions, 10 edits
  and 5 deletions per answer (`CALENDAR_LIMITS`). Card clicks go to
  `POST /api/jarvis/conversations/:id/calendar/:cardId` and reach the next
  turn through `calendarOutcomes`. New events are stored like the calendar
  form stores them (zone-less Prague time, all-day end = day after); the
  date helpers live in `server/jarvis/time.js`. An open calendar screen
  reloads on `walter:calendar-changed` (`client/src/jarvis/calendarEvents.ts`).
- **Documents** (`read_document`, `server/jarvis/documents.js`): only text
  goes into the conversation (it is re-sent every turn). PDFs via `unpdf`,
  .docx/.xlsx/.pptx by unzipping with adm-zip, scans and photos transcribed
  once by Claude (`JARVIS_OCR_MODEL`, default the Jarvis model). The tool only
  reads a document listed under a subject the user can open: the
  `/documents/:id/download` route itself does not check sections.
- **Attachments** (`server/jarvis/attachments.js`, `POST /api/jarvis/attachments`):
  files attached to a message go to the Anthropic **Files API** (90-day
  expiry) and the stored message holds only a `file_id` block — never the
  bytes, which would be re-sent every turn. Images and PDFs are passed as
  they are (Claude sees the page); Office/text files go through
  `documents.js` and are uploaded as plain text. Upload and send are two
  steps: uploads wait in memory for an hour for their own user, the chat
  request names them by id. Deleting a conversation deletes its files; an
  expired file makes the API reject the history, which `agent.js` reports
  as "start a new conversation". The browser shrinks photos to 2000 px.
- **ARES** (`company_registry`, `server/ares.js`): the public Czech
  business register, called directly (no key, read-only, not app data). An
  IČO is checked against its mod-11 check digit before ARES is asked; a city
  goes to ARES as `sidlo.textovaAdresa` (ARES refuses searches over 1 000
  hits). People are returned with name and role only — the register's home
  addresses and birth dates are left out on purpose. Jarvis stores an IČO
  only through a confirmed `propose_update`.
- **Changes with approval** (`propose_update`, `propose_note`,
  `server/jarvis/proposals.js`): Jarvis never writes on its own. A propose
  tool checks the values (IČO check digit, allowed states/priorities/tiers,
  real dates), records each field's current and new value, and the panel
  shows a card; `POST /api/jarvis/conversations/:id/proposals/:pid` with
  `apply` writes it through the app's API with the agent token (its own
  changeset in the change log), `reject` declines. A field that changed since
  the card was made is not overwritten (status `stale`). Decisions are
  transcript items (`proposal_status`) and reach Jarvis's next turn through
  `proposalOutcomes` in the `<kontext>` block. Only fields in
  `SUBJECT_FIELDS` / `COMMISSION_FIELDS` can be changed — names, companies,
  obor and places are trees the profile panel edits; viewers cannot propose.
- **Answers written before a tool call vanish on Opus 5.5**: text between tool
  calls comes back as a thinking-block progress note, so "answer, then
  open_record" ends the turn with nothing to show. The prompt asks for the
  answer after the last tool; if a turn still ends empty, `agent.js` appends
  one mid-conversation system message asking for it (stored with the
  history). Never store an assistant message with empty content — the API
  rejects the whole history afterwards; `routes.js` skips old ones on load.
  `display: "updates"` would surface the notes, but the safety fallback can
  send the same request to an older model that rejects it.
- **Search tolerates typos** (`server/jarvis/fuzzy.js`): when `search` finds
  fewer than 3 exact hits it adds `priblizne_shody` — sound-alike spellings
  (w/v, y/i, doubled letters), small typos, real Czech case endings and codes
  without zeros (K12 → K012). Numbers and phone numbers only match exactly.
  Near misses much weaker than the best one are dropped, or "nowak" would also
  return every "Nová společnost". Test changes against `server/data/db.json`
  by calling `runTool('search', …)` with a mocked `api.get` — no server needed.
- **The open record** ("tenhle klient"): each section grid reports its open
  profile panel with `useReportJarvisFocus(buildJarvisFocus(...), isActive)`
  (`client/src/jarvis/jarvisFocus.ts`); the panel sends it as
  `context.record` / `context.commission` and shows it as a chip. A new grid
  with a profile panel must report it too, or Jarvis will not know what is open.
- **Voice** (`server/jarvis/voice.js`, `client/src/jarvis/voice.ts`,
  `useJarvisVoice.ts`): speech-to-text (`POST /api/jarvis/transcribe`, raw
  audio body) and read-aloud (`POST /api/jarvis/speech`) go through OpenAI with
  `OPENAI_API_KEY` — Claude has no audio. Env: `JARVIS_STT_MODEL`
  (gpt-4o-transcribe), `JARVIS_TTS_MODEL` (gpt-4o-mini-tts), `JARVIS_TTS_VOICE`
  (default voice, cedar), `JARVIS_STT_LANGUAGE` (cs; empty = auto),
  `JARVIS_VOICE_HOURLY_LIMIT` (300). Each user picks a voice (`TTS_VOICES`,
  13 OpenAI voices by gender) and speed in the panel's voice menu
  (`voiceSettings.ts`, localStorage); speed goes to OpenAI's `speed`
  parameter, so faster speech keeps its pitch. Spoken questions go off after
  a chosen pause (default 2.5 s — a breath is shorter) or, in manual mode,
  only on the send button; the browser recognizer runs continuously so the
  same pause applies to it. Without the key the browser's own engines stand in (Chrome on Windows
  only has the robotic "Microsoft Jakub" for Czech). A spoken question sends
  `context.voice`, which adds "Režim: hlasový" to the `<kontext>` block — the
  `<hlas>` rules in the system prompt stay static. The mic level lives in a ref
  that `LevelMeter` reads on its own animation frame; putting it in React state
  re-renders the whole panel 20× a second.
- To test voice without a microphone, override
  `navigator.mediaDevices.getUserMedia` in the page to return a
  `MediaStreamDestination` stream playing a `/api/jarvis/speech` MP3: the pause
  detection, transcription, answer and read-aloud then all run for real.
