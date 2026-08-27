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
- Prefer ag-Grid's own APIs (`ensureColumnVisible`, `getColumnState`,
  `sizeColumnsToFit`) over hand-computed pixel maths against ag-Grid's internal
  DOM. Its internals (`.ag-center-cols-container` height, the fake horizontal
  scrollbar) are managed by the grid, and CSS or JS that overrides them tends to
  break virtualization and row clipping in ways that are hard to trace.

## Verifying grid changes locally

Grid changes are verifiable end to end; do it rather than guessing.

1. `preview_start` the `server` (port 3004) and `client` (port 5173) entries from
   `.claude/launch.json`.
2. `server/db.json` is tracked and starts with no users. Back it up, then
   `node server/create-user.js <name> <pass> Admin`.
3. **Restore `server/db.json` before committing** (`git checkout -- server/db.json`).
4. ag-Grid virtualizes columns, so measuring header cells in the DOM undercounts.
   Reach the grid API through the React fiber on `.ag-root-wrapper` (walk
   `.return` until `stateNode.api.getColumnState` exists) and measure via
   `getColumnState()` instead.
5. `server.js` has no hot reload — restart it after server edits, or new columns
   are silently dropped by stale field whitelists.
