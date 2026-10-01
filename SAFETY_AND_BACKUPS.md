# Change log, backups and safety guards

Everything here lives in `server/safety/` and is managed from the app under
**Ostatní → Bezpečnost a zálohy** (admins only). It runs on the PostgreSQL
backend (production). The local JSON development backend does not have it and
says so on that screen.

## What is protected, and how

| Layer | What it does | Where |
|---|---|---|
| Change log | Every insert/update/delete on every table is recorded by a database trigger: who (user, AI agent, public form, system), when, the route, and the whole record before and after. One user action = one *changeset*. | `pg-install.js` (`walter_audit_row`) |
| Revert | Undo one change, a whole action, or restore any earlier version of a record. Conflicting later edits are shown, never silently overwritten. Reverts are themselves logged. | `pg-store.js`, `revert.js` |
| Trash (Koš) | Deleted records, including cascaded commissions and the bytes of deleted files, can be restored for as long as the log keeps them. | `pg-store.js` (`listTrash`) |
| Backups | Nightly snapshot of all data; document files copied off-site once each (deduplicated by SHA-256). Restore applies only the differences, takes a safety backup first, and is itself revertible. | `backups.js` |
| Guards | `TRUNCATE` blocked on every table; `DROP TABLE` / `DROP COLUMN` blocked in `public`; one statement deleting more than 20 rows of business data refused (cascades excepted); the change log is append-only. | `pg-install.js` |
| AI agent brakes | Kill switch, no hard deletes (archive only), per-run row limit, no access to users/settings/backups/log, read-only DB login for searching. Enforced in the database, so they hold whatever code path the agent uses. | `pg-install.js`, `context.js` |

### Backup schedule (retention)

The nightly job (02:00 Prague time) makes one backup a day:

| Kind | When | Kept |
|---|---|---|
| Daily (Denní) | every night | 7 days |
| Weekly (Týdenní) | Sundays | 5 weeks |
| Monthly (Měsíční) | 1st of the month | 12 months |
| Safety (Bezpečnostní) | automatically before every restore | 14 days |
| Manual (Ruční) | "Zálohovat teď" | until deleted |

The 3 newest successful backups are never deleted, whatever their age. The
change log itself is kept for 365 days (`AUDIT_RETENTION_DAYS`). If a nightly
backup fails, every admin with a notification e-mail gets an e-mail (needs
`BREVO_API_KEY`, the same as submission notifications).

## Setting up the off-site copy (Cloudflare R2) — do this once

Until this is done, backups are stored only inside the database they protect:
fine against bad edits and AI mistakes, useless if the database itself is lost.

1. **Cloudflare dashboard → R2 Object Storage → Create bucket.** Name it e.g.
   `walter-backups`, location automatic.
2. **R2 → Manage API tokens → Create API token.** Permission *Object Read &
   Write*, applied to that bucket only, no expiry. Copy the **Access Key ID**,
   the **Secret Access Key** and the **S3 endpoint**
   (`https://<account-id>.r2.cloudflarestorage.com`).
3. **Generate an encryption passphrase** — long and random — and store it in a
   password manager. Without it the off-site backups cannot be read. Never
   change it casually: old backups stay encrypted with the old one.
4. **Railway → server service → Variables**, add:

   ```
   BACKUP_S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
   BACKUP_S3_BUCKET=walter-backups
   BACKUP_S3_ACCESS_KEY_ID=...
   BACKUP_S3_SECRET_ACCESS_KEY=...
   BACKUP_ENCRYPTION_KEY=...
   ```

5. After the redeploy, open **Bezpečnost a zálohy → Zálohy**, click
   **Otestovat off-site**, then **Zálohovat teď**. The first run uploads every
   document (~460 MB) and takes a few minutes; later runs upload only new files.

Also worth switching on, as an independent extra layer: Railway's own
volume backups on the Postgres service (Postgres service → *Backups*, if your
plan has them).

### Other settings (all optional)

| Variable | Default | Meaning |
|---|---|---|
| `AUDIT_RETENTION_DAYS` | `365` | How long change-log entries (and deleted files' bytes) are kept |
| `BACKUP_HOUR` | `2` | Hour (Prague) the nightly backup runs |
| `BACKUP_SCHEDULE_DISABLED` | — | `true` turns the nightly backup off |
| `BACKUP_S3_REGION` | `auto` | Only for non-R2 S3 providers |
| `BACKUP_S3_PREFIX` | `walter-backups` | Folder inside the bucket |
| `AI_READONLY_DB_PASSWORD` | — | Creates the `walter_ai_readonly` database login for the AI agent's searches |

## Disaster recovery (the database is gone)

If the database is lost or wiped, nobody can log in to restore from the UI, so
restore from the command line into a fresh, empty Postgres:

```bash
cd server
# DATABASE_URL must point at the NEW database. server/.env points at
# production — set it explicitly in the shell for this.
# BACKUP_S3_* and BACKUP_ENCRYPTION_KEY: the same values as on Railway.
node safety/restore-cli.js --list                   # backups in the bucket
node safety/restore-cli.js --latest                 # preview only
node safety/restore-cli.js --latest --yes           # actually restore
node safety/restore-cli.js --file zaloha.json.gz    # a backup downloaded from the app
```

It creates the schema on the empty database, then restores every table and
pulls the document files from the bucket. Then point the Railway server at the
new database and redeploy.

## For the AI agent (when it gets built)

- **Writing from inside the server** (a chat tool call, say): wrap the work in
  `runAsAgent({ runId, note, onBehalfOf: req.user }, async () => { ... })` from
  `server/safety/context.js`. Every change is tagged `ai_agent`, grouped under
  `runId` (one click reverts the whole run) and attributed to the person the
  agent acted for.
- **Writing over HTTP**: give the agent its own account with role `ai_agent`.
  It can send `X-Walter-Changeset: <run id>` to group several requests into one
  run, and `X-Walter-Change-Note: <why>` to explain each change.
- **Searching**: set `AI_READONLY_DB_PASSWORD`; the agent connects as
  `walter_ai_readonly` (read-only, 15 s statement timeout, subjects /
  commissions / notes / catalogs / document metadata only).
- **What the database refuses** (SQLSTATE in brackets): any agent write while
  the kill switch is off, agent deletes unless allowed, more changed rows per
  run than the limit, agent writes to users / settings / backups (`WS001`);
  mass deletes (`WS002`); `TRUNCATE` (`WS003`); editing the log (`WS004`);
  dropping tables or columns (`WS005`).
