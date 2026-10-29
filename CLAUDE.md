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

## Tests and automatic checks

- `npm test` in `server/` runs `server/tests/*.test.js` with Node's own test
  runner (Node 22; no API key, no database, ~2 s): model routing, Prague
  time, fuzzy search, the usage view, the login guard and both servers'
  section guards. Add a test there for any pure helper you touch.
- `.github/workflows/checks.yml` runs on every push to main and every pull
  request: `npm ci`, `node --check` of both servers and `npm test` for the
  server; `npm ci`, ESLint, `tsc -b` and `vite build` for the client. ESLint
  runs with `no-explicit-any` and `react-refresh/only-export-components` off
  (55 and 11 older cases); every other rule must pass, the React hook rules
  included (they caught ClockTimePicker's hooks after an early return).
- The Jarvis test set (`server/evals/jarvis/`) is separate: it spends real
  money and is run by hand.

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

## Section access (scopes)

A user's `access_scope` (`all`, `standard` = Veřejné, `projects` =
Neveřejné, `growth` = Growth Club) is enforced by `app.use` guards near the
top of both servers (`requireAccessScope`, plus `rejectViewerWrites`):
`/api/{client,partner,tiper}-{entities,commissions}`, `/clients|partners|tipers`,
`/api/projects`, `/api/growth`, `/project-*`, `/growth-*` (their documents,
folders and notes), and `/documents/:id/*` by the document's own subject
(`documentScopes`; Budoucí funkce documents are open to everyone).

- **Write a guard's regex with a lookahead: `/^\/api\/projects(?=\/|$)/`.**
  Express 4 skips an `app.use` layer whose matched path is not followed by
  `/` or the end of the URL. The old `(\/|$)` consumed the slash, so until
  2026-10-29 every guard ran only for the bare prefix and no section was
  enforced below it (`/api/projects/client-entities` was open to a Veřejné
  user). Check a new guard with a limited-scope user, not an admin.
- The client hides other sections (`isViewAllowedForScope`); the deal-link
  picker loads every section and skips the ones that answer 403.

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
  new call to Anthropic, OpenAI, Brave or ElevenLabs must call `recordAiUsage`**
  (`finance/usage.js`; fire-and-forget, never throws). It breaks costs down per
  feature; once a provider is connected its bill replaces the estimate.
  ElevenLabs (Jarvis's native Czech voices) logs here too, by the
  character; it has no bill connector, so its chart bars are always the
  log's estimate (`hasNoBills` in financeMath.ts).

- **History** (tab Historie, `server/finance/history.js`, `HistoryTab.tsx`):
  every payment month by month from **09/2025** (`HISTORY_START`). Three
  entry kinds, never copied into one another: `bill` (provider bills read
  straight from `finance_provider_costs`, one entry per provider and month),
  `recurring` (months filled in from confirmed fixed costs into
  `finance_payments` on every history load — active, not an estimate,
  amount > 0, monthly or yearly, not billed by a configured connector; a
  domain year after its RDAP expiry is skipped) and `manual`. Removing a
  recurring month only sets `dismissed`, so the next fill does not bring it
  back. Every foreign amount is converted at the **ČNB rate of its own day**
  (`createDayRates`, ČNB yearly files) unless the admin typed the exact CZK
  charged (`amount_czk`). A connector's first sync — and the first sync after
  `HISTORY_START` moves — reads bills back to that date (`historyFrom` in its
  sync state).

- **Jarvis tab** (`JarvisUsageTab.tsx`, `GET /api/finance/jarvis?days=7|30|90`,
  `jarvis-usage.js`): `finance_ai_turns` keeps one row per Jarvis question
  (`recordJarvisTurn`, written in the chat route's `finally`): the question
  (300 chars), time to the first word and to the end, tools, how it ended
  (`turnStatus`: ok, stopped, empty, truncated, error, refusal, tool_limit)
  and its estimated cost. With `finance_ai_usage` per user and feature it
  shows cost per person, the most expensive and slowest questions and the
  failed ones. Admins see other people's questions here. A stopped answer
  has no usage (the stream ended before its totals), so it costs 0 here.
  Roles are checked case-sensitively (`requireRole('admin')`): a local test
  user made with role `Admin` gets 403 on every Finance route.
  **Ratings** (👍/👎 under each answer, `AnswerFeedback` in JarvisPanel.tsx,
  `POST /api/jarvis/conversations/:id/feedback` with `turn` = the
  question's position from 0): stored twice, as a `feedback` transcript
  item (the panel shows it again; the newest per turn wins, `none` takes it
  back) and in `finance_ai_feedback` (telemetry, with question, answer and
  model). The tab shows 👍/👎 per model and the latest 👎 with the user's
  note: the evidence for whether the cheaper models are good enough.
  **The Anthropic credit**: a call refused for lack of prepaid credit sets
  `anthropic_credit` in `finance_state` (`recordAnthropicCredit`, written
  only on change); Finance shows a red warning until a call succeeds.

The telemetry tables (`finance_ai_usage`, `finance_ai_turns`, `finance_provider_costs`,
`finance_state`) are in `AUDIT_EXCLUDED_TABLES`; `finance_expenses` and
`finance_payments` are logged.
CZK conversion uses ČNB's daily fixing (`rates.js`, fixed fallback). To test
a connector locally, pass its token as an env var to a wrapper around
`server.js` — never write tokens into tracked files.

## Úkoly and Hlášení chyb (`server/tasks/`, `server/bugs/`)

Úkoly is the team's simple to-do list, separate from Budoucí funkce (product
ideas): one `tasks` table holds every user's personal list (`list =
'personal'`, `owner_user_id`) and the shared team list (`list = 'team'`,
optional `assignee_user_id`). A task is `todo`, `later` or `done`; a `later`
task with a `due_date` comes back to "K udělání" on that day by itself
(`taskBucket` in `client/src/tasks/tasksApi.ts`, the browser's own date).
Anyone signed in can read every list; a personal list is changed only by its
owner or an admin, the team list by anyone but viewers. The section
(`TasksView.tsx`) and the top-right floating window (`FloatingTools.tsx`,
Alt+T) share `useTaskList`, which drops a reload that started before a change
finished — otherwise a quick second add vanishes until the next refresh.

Hlášení chyb: the bug button next to it opens `BugReportDialog` from any
screen (title, description, severity, screenshots by Ctrl+V, drop, file or
`getDisplayMedia` capture); the date, the screen and the author are filled in.
Screenshots go up as multipart (`reenterRequestContext` after multer) into
`bug_report_screenshots` (bytea, raster images only, deleted with their
report, kept out of the change log in `AUDIT_EXCLUDED_TABLES`). Admins and
managers triage; a report is deleted by an admin, or by its author while
still `new`.

The floating buttons sit at z-index 950, under the profile panel. Several
non-grid screens have buttons in the top-right corner, so `.main-content`
gets a 30px band at the top except on the grid screens (FloatingTools.css);
check a new screen's top-right corner against the buttons.

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
- **Long conversations are trimmed on Anthropic's side** (`CONTEXT_MANAGEMENT`
  in agent.js), never by editing the stored history — a client-side edit or
  keep-tail summary would invalidate every later thinking block. Past
  `JARVIS_CLEAR_TOOLS_AT` (40 000) input tokens, old tool results become a
  placeholder (the latest 8 stay; the write tools' small results are never
  cleared; at least 10 000 tokens at a time, since clearing rewrites the
  prompt cache). Past `JARVIS_COMPACT_AT` (120 000, API minimum 50 000) the API
  writes a `compaction` summary at the start of the reply; it is stored with
  the reply, and the API ignores everything before the last one. Its usage
  iteration is not in the top-level counts, so `addUsage` adds it. The panel
  shows the compaction as a step. To test, run `runJarvisTurn` from a script
  in `server/` on a synthetic history of large `search` results with
  `JARVIS_COMPACT_AT=50000` (about half a dollar per run).
- Tool inputs are validated with zod (`zod/v4`) before running; a tool failure
  goes back to the model as an `is_error` result, never as an exception.
- **Test set** (`server/evals/jarvis/`): 38 typical Czech questions
  (`cases.js`) against a made-up company (`fixture.js`, dates relative to
  the run day, no real data). `node evals/jarvis/run.js` (from `server/`)
  starts its own `server.js` on port 3099 with a temporary `DATA_DIR`
  (server/data is never touched), asks every question as `eval.admin`,
  and grades each answer: the runner's own checks (tools, cards, words in
  the answer, data unchanged after a proposal) plus, for cases with a
  `rubric`, a Sonnet 5.5 grader with structured output. Results go to
  `.claude/hillclimb/jarvis/<variant>/` (gitignored, resumable;
  `--only`, `--tags`, `--reps`, `--no-judge`, `--variant v1`). Real
  money: ~0.02–0.04 $ a case once the prompt is cached, about 2 $ a full
  run. Run it before changing the prompt, the tools or the model.
- **@Jarvis in Týmový chat** (`answerInRoom` in jarvis/routes.js, called
  from the message POST in both servers when the text matches
  `JARVIS_MENTION`): one answer posted to the room as user `Jarvis`, with
  no stored conversation. The room is read by the whole team, so the answer
  runs with the standard scope (public section only, enforced by the API
  too) and `teamChat` set in the tool context: `runTool` refuses the
  writing and card-making tools (`TEAM_CHAT_BLOCKED_TOOLS`). The `<kontext>`
  line "Režim: týmový chat" tells Jarvis why. Replies render as Markdown
  (TeamChatView checks the username).
- **Models** (`server/jarvis/models.js`): Opus 5.5 (`JARVIS_MODEL`), Sonnet
  5.5 (`JARVIS_MODEL_SONNET`), Haiku 5.5 (`JARVIS_MODEL_HAIKU`). The panel's
  picker sends `model` (`auto` or a key); `auto` runs `chooseModel`: pattern
  matching only, no API call. Each answer is stored with `model` and
  `routing` (`{mode, key, reason}`) and the panel labels it. Costs are
  logged per call with the model that ran (finance). Per-model differences:
  `profileFor` (Haiku: no `fallbacks`, basic web tools `web_search_20250305`
  / `web_fetch_20250910`, no context management or compaction beta;
  `toolDefinitionsFor` builds the tool list). **The history goes to every
  model unchanged**: the API drops thinking blocks the current model cannot
  read (unbilled) and keeps them for a later turn on one that can; stripping
  them in code is a history edit and can cause signature 400s. A
  conversation holding a `compaction` block or code-execution blocks (from
  the dynamic web tools) is never continued on Haiku: `resolveModel` moves
  it to Sonnet and says so in `routing.reason`. Quality check:
  `node evals/jarvis/run.js --model haiku --variant v90` (variants v90/v91
  are the Haiku/Sonnet runs; they are not baseline). On the nine-case subset
  Haiku passed 7/9, Sonnet 8/9; Haiku's misses were bare pointers to a
  button on list/deadline questions, so list words (`NOT_SIMPLE`) keep a
  question off Haiku. When the Anthropic account runs out of prepaid
  credit, every model fails; `friendlyError` says so in the panel.
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
  reads a document listed under a subject the user can open, and the
  document routes check the section as well (`documentScopes`, below).
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
  `OPENAI_API_KEY` — Claude has no audio. OpenAI's voices are trained mostly
  on English, which is why Czech sounds flat and slightly foreign. Two
  read-aloud engines (`TTS_ENGINES`), both voice *chat* models asked to read
  the text verbatim:
  - **Rychlý** (`realtime`, the default, `JARVIS_REALTIME_MODEL`
    gpt-realtime-2.1-mini). It is Realtime-API only, so each piece is one
    short WebSocket session through the `ws` package (`synthesizeRealtime`).
    Railway's Node may be 20, which has no global WebSocket.
    - Session settings: `reasoning: { effort: 'minimal' }` (the default
      reasoning added ~0.7 s and nothing audible) and the real
      `audio.output.speed`.
    - Output is 24 kHz PCM, returned as WAV.
    - First sentence ~1.3–2.4 s through the route; ~0.6 Kč/min.
  - **Původní** (`conversational`, `JARVIS_AUDIO_MODEL` gpt-audio-1.5 through
    chat completions, MP3). ~2–2.5 s per first sentence, ~2 Kč/min. It has
    no speed parameter, so the tempo is asked for in words (`TEMPO`).
  - The plain TTS engine (gpt-4o-mini-tts, "Klasický") was removed on
    2026-10-28: OpenAI shuts it down on 6 Jan 2027. A stored `classic` choice,
    or `JARVIS_TTS_ENGINE=classic`, falls back to the default engine.
  - `isFaithfulReading` compares each reading's transcript with the text. A
    piece one engine fails on or does not read verbatim goes to the other;
    if both fail, the route returns 502 and the browser's voice reads the
    rest.
  - Record codes are spelled out in Czech before reading (`spellCodes`:
    "K012-003" → "ká nula jedna dva, nula nula tři"). Left to the model,
    they sometimes came out as "K zero jedna dva".
  - The faithfulness check ignores digits, digit names and letter names,
    since the transcript writes them either way.
  - **ElevenLabs** (`elevenlabs`, a third engine and its own provider, only
    when `ELEVENLABS_API_KEY` is set; `ELEVENLABS_MODEL` default
    `eleven_v4_turbo`, $0.04 per 1,000 characters). These are native Czech
    library voices (`ELEVENLABS_VOICES`, picked 2026-10-28 by pairwise
    listening; Ondřej is the deep one).
    - It is a plain TTS model, so there is no verbatim check.
    - If a reading fails, OpenAI reads in the first OpenAI voice of the same
      gender (`standInVoice`).
    - Speeds map onto its 0.7–1.2 range (`ELEVENLABS_SPEED`).
    - The plan caps requests at once (Starter 3), so pieces queue in-process
      up to `ELEVENLABS_CONCURRENCY` (default 3) instead of failing over.
    - Usage is logged as provider `elevenlabs`, priced per character
      (pricing.js), and shown in the finance chart. The catalog line is the
      plan fee.
    - A library voice its owner withdraws fails, and the OpenAI fallback
      covers it.
  - The status route sends `providers` and the `engines` available (each
    with `provider` and `defaultVoice`). The voice menu shows "Hlasy od"
    (OpenAI / ElevenLabs) and the provider's engines and voices.
    `voiceSettings.byProvider` remembers the engine and voice last used with
    each provider. Previews pass `{ voice, engine }` to `speak`.

  Other env:
  `JARVIS_TTS_ENGINE`, `JARVIS_STT_MODEL` (gpt-transcribe; gpt-4o-transcribe
  is deprecated and stops on 26 Feb 2027), `JARVIS_TTS_VOICE` (default voice,
  cedar), `JARVIS_STT_LANGUAGE` (cs; empty = auto; gpt-transcribe takes it as
  `languages: [..]`), `JARVIS_VOICE_HOURLY_LIMIT` (300). **Transcription**:
  measured on TTS-spoken Czech questions, clean and with noise and a
  laptop-mic band, both gpt-transcribe and gpt-4o-transcribe are within a
  few % word errors *with* the context prompt (`STT_PROMPT`) and drift into
  Slovak without it. Uncommon names are what it gets wrong, so the panel
  sends **hints** with each recording (`transcriptionHints.ts`, header
  `X-Jarvis-Hints`, base64 JSON, `readTranscriptionHints`): `keywords` (the
  open record's code and name, names and codes from the last two answers,
  records offered by open_record, the attention list) and the last answer as
  `context`. On questions with uncommon names that cut word errors from
  ~17 % to ~11 % and never inserted a name that was not said; generic domain
  words as keywords did not help. When a user reports
  "it hears the wrong words", suspect the microphone first: a Bluetooth
  headset in hands-free mode sends narrowband, compressed audio.
  `startRecording` avoids it when the computer has another microphone
  (`chooseMicrophone`; device names are only known after the first
  permission), and the voice menu's "Mikrofon" section shows the device used
  and plays back the last recording. Recording is Opus at 64 kb/s. Each user picks an engine, a
  voice and speed in the panel's voice menu (`voiceSettings.ts`,
  localStorage). `TTS_VOICES` is six voices, the best three per gender from a
  comparison of all nine gpt-audio voices reading Czech (Marin, Shimmer,
  Coral; Cedar, Verse, Echo), each with a face drawn in
  `VoiceAvatar.tsx` (a new voice needs one, or it gets a grey silhouette).
  Picking one plays a sample in it (`speak(..., { voice })`); the chosen
  face replaces the menu button's icon. An older stored choice no longer on
  offer reads in the default voice. The ElevenLabs voices have their own
  faces in the same file. Spoken questions go off after
  a chosen pause (default 2.5 s — a breath is shorter) or, in manual mode,
  only on the send button; the browser recognizer runs continuously so the
  same pause applies to it. Without the key the browser's own engines stand in (Chrome on Windows
  only has the robotic "Microsoft Jakub" for Czech). A spoken question sends
  `context.voice`, which adds "Režim: hlasový" to the `<kontext>` block — the
  `<hlas>` rules in the system prompt stay static (they also tell Jarvis
  that names may be misheard and codes come as words, "ká dvanáct pomlčka
  tři"). **Conversation mode**
  (`conversation` in voiceSettings, on by default): once the answer to a
  spoken question has been read to the end, the mic reopens by itself with a
  short tone (`startListening({ followUp: true })`, `playListenCue`). It does
  not reopen when the reading was stopped, the panel is closed, the tab is
  hidden, or the answer left a card to click (proposal, deletion, e-mail).
  A follow-up gives up quietly after 7 s of silence in either send mode
  (`noSpeechMs`), and "děkuji, to je vše" and the like (`isConversationEnd`)
  end it instead of being sent. Recording uses the shared, already unlocked
  `AudioContext`, because Safari keeps one created outside a click suspended
  and the pause detection would hear nothing. **Reading starts early**
  (`createSpeechStream` in voice.ts): with the server voice an answer is read
  while it is still streaming. `settledMarkdown` keeps only what can no
  longer change (whole lines, finished sentences; a table waits for the line
  after it, a code block for its closing fence), so the spoken text is always
  a prefix of the final one. `cutPieces` makes the first piece short (≥ 50
  chars, ~2.5 s to voice instead of ~4–5 s) and later ones 140–320 chars,
  two fetched ahead. Text dropped for a tool call stops the reading. Each
  piece is one `/api/jarvis/speech` request. The mic level lives in a ref
  that `LevelMeter` reads on its own animation frame; putting it in React state
  re-renders the whole panel 20× a second.
  - **Barge-in** (`interrupt` in voiceSettings, the "Když Jarvis mluví"
    switch; `watchForSpeech` in voice.ts, used by useJarvisVoice): while
    the server voice reads an answer, the mic is watched. A level above
    `INTERRUPT_LEVEL` for `INTERRUPT_MS` stops the reading and opens the
    next question. The browser's voice is not interrupted (its own output
    would be heard). Threshold is fixed: a loud room can interrupt.
  - **Live captions**: with the server voice, the browser recognizer runs
    beside the recording and fills `voice.interim`; the server transcript
    replaces it. No extra API cost.
- **Files: Word, PDF, Excel** (`server/jarvis/documentMaker.js`).
  - `create_document`: Jarvis writes Markdown (or Excel `sheets`), and
    `renderDocument` lays it out.
    - Word goes through `docx`, PDF through `pdfmake`, Excel through
      `exceljs`; `marked` parses the Markdown.
    - PDF uses pdfmake's bundled Roboto (every Czech letter). pdfmake may
      read only its font folder and fetches no URLs.
  - `export_records`: the same filters as `list_records` (`queryRecords`),
    all matching rows, into Excel. The server reads the rows (Jarvis never
    copies them) and re-reads them on every download, as the downloading
    user (`exportSheets`).
  - Nothing is stored. The transcript item `{ type: 'document', document,
    spec }` keeps what the file is made from, and
    `GET /api/jarvis/conversations/:id/documents/:docId` renders it again
    (milliseconds). The conversation route strips `spec` before sending the
    transcript to the panel.
  - The panel shows a `DocumentCard` with "Stáhnout" (a blob download; the
    file name comes from the card, since a cross-origin
    `Content-Disposition` is not readable).
  - Google Docs are not made: they would need Google OAuth or a Workspace
    shared drive, which is the user's decision. Word and Excel files open in
    Google Docs and Sheets once uploaded to Drive.
  - The library versions are pinned (`--save-exact`) to releases at least
    two weeks old.
- **Web search** (`web_search_20260209`, `web_fetch_20260209`: Anthropic
  server tools, appended to `TOOL_DEFINITIONS` as `WEB_TOOLS`).
  - Claude filters the results in its own code sandbox, so the reply also
    holds `code_execution` server blocks. All of it is stored and replayed
    as is.
  - `user_location` is not set: the API refuses country `CZ`. The prompt's
    `<web>` rules make Jarvis search in Czech and end with a "Zdroje:" line.
  - The stream handler shows `web_search` / `web_fetch` as steps once the
    query is known (`webLabel`). It ticks them off on their
    `*_tool_result` block and stores them with the turn (`webSteps`).
  - Citations, when the API sends them, become a `sources` transcript item
    and list. With dynamic filtering they are usually absent, so the
    answer's own links are the sources.
  - `stop_reason: 'pause_turn'` (a long server-side search) stores the reply
    and sends it back unchanged, with no extra user message.
  - Searches are counted from `usage.server_tool_use` and logged as
    provider `anthropic`, feature `web_search` ($10 per 1,000 on top of the
    tokens; a search turn is roughly 2–2.5 Kč with its ~20k result tokens).
- **E-mail drafts** (`draft_email` in tools.js): Jarvis only drafts. The
  draft is a transcript item (`type: 'email'`) shown as an editable card
  (`EmailCard` in JarvisPanel.tsx) that opens it via `mailto:`, Gmail's or
  Outlook's compose URL, or copies the text. A `mailto:` link over ~1 800
  characters goes out without the body, which is copied to the clipboard
  instead (some mail programs cut long links). There is no sending from the
  server, on purpose.
- **Reminders and the morning briefing** (`server/jarvis/attention.js`,
  `GET /api/jarvis/attention`, cached 5 min per user, `?fresh=1` bypasses):
  plain rules, no AI — the user's assigned zakázky past their deadline, due
  today or within 3 days, untouched for 30 days (not Uzavřeno/Zrušeno/
  Odloženo), and personal to-dos due today or earlier. The launcher shows how
  many are late or due today; the bell in the panel lists them (an item opens
  its record). Jarvis reads the same list with the `reminders` tool and Úkoly
  with `tasks` (read-only). "Ranní přehled" sends `BRIEFING_PROMPT`, which the
  `<prehled>` rules in the system prompt answer. "Připomeň mi…" becomes a
  calendar event. Day boundaries are Prague midnight (`pragueMidnight` drops
  any time of day it is given).
- To test voice without a microphone, override
  `navigator.mediaDevices.getUserMedia` in the page to return a
  `MediaStreamDestination` stream playing a `/api/jarvis/speech` MP3: the pause
  detection, transcription, answer and read-aloud then all run for real.
