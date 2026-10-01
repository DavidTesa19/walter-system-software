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
