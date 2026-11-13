# Railway costs: findings and to-do

Measured 2026-11-13 from Railway › Usage › Cost by Service. Railway bills almost
only **RAM held**, about **$10 per GB per month**, whether anyone uses the app or
not. CPU, traffic and disk together come to under $0.30 a month.

| Service | 12 Sep – 12 Oct | 12 Oct – 12 Nov | Avg RAM (Oct–Nov) |
|---|---|---|---|
| Postgres | $2.98 | **$7.66** | 0.73 GB (was 0.28) |
| Back-End (api.waltersystem.cz) | $1.66 | $2.26 | 0.21 GB |
| Walter System Front-End (app.waltersystem.cz) | $2.17 | $1.96 | 0.19 GB |
| Front-End Period 0 | $1.06 | $1.37 | 0.13 GB |
| Back-End Period 0 | $0.70 | $0.94 | 0.09 GB |
| Public Form Page (form.waltersystem.cz) | $0.71 | $0.64 | 0.06 GB |
| Form Page Period 0 | $0.37 | $0.55 | 0.05 GB |
| Deleted services (ran part of the period) | $6.25 | $1.93 | — |
| **Usage** | **$15.91** | **$17.30** | ≈ 1.65 GB |

The $20.89 invoice of 2026-11-12 = $17.26 usage + 21 % VAT. The Hobby plan's
$5 fee includes $5 of usage, so **anything under $5 of usage is free**.

Why it went up:

1. **Since about June: the "Period 0" copies.** Back-End, Front-End and Form
   Page "Period 0" run the `snapshot/period-0` branch (the app as of
   2026-04-07) on `*-period-0-production.up.railway.app`. The "deleted
   services" were most likely the `snapshot/period-1` copy.
2. **October: Postgres RAM 0.28 → 0.73 GB, still climbing** (680 → 770 MB over
   the month). Most likely cause: the nightly backup (from 2026-10-01) computes
   `sha256(data)` and `octet_length(data)` of **every document file** (400+ MB,
   `rowSelectSql` in `server/safety/backups.js`), so Postgres reads all the
   files every night and keeps them in memory. The backup archives themselves
   are small (a few MB each). To be confirmed by step 3.
3. The two static sites (`npx serve`) hold ~250 MB between them to serve files.

## To-do, one by one

Savings are per month, estimated from the table above. Backups, the change log
and every safety guard stay as they are.

- [ ] **1. Pay the past-due invoice** (you; Railway › Billing › Pay Invoice).
      Railway says it will disconnect services otherwise.
- [x] **2. Pause the three Period 0 services, without deleting them** (you,
      or Claude in Chrome on your go-ahead). Saves ≈ $2.90.
      **Done 2026-11-13**: all three deployments removed, services show
      "Service is offline"; app, api (`/health` ok) and form still up.
      Each service › Deployments › the active deployment's ⋮ › **Remove**. The
      service, its variables, domain and deploy history stay; **Redeploy** on
      the last deployment brings it back. The code stays in the
      `snapshot/period-0` branch.
      Do Back-End Period 0 first: it has its own `DATABASE_URL`, and if that is
      the live database, April's code is running against today's data.
- [ ] **3. Measure what Postgres holds** (read-only; run in Railway › Postgres
      › Database › query, or give Claude the go-ahead to run it):
      `SELECT relname, pg_size_pretty(pg_total_relation_size(relid)) FROM pg_statio_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 15;`
      Confirms whether documents / `audit_blobs` / `walter_audit` / `backups`
      are what fills memory before we change code.
      **Done 2026-11-13** (read-only session): database **507 MB**, of which
      `documents` **478 MB** (the files, in TOAST); everything else is small:
      `backups` 7.8 MB (12 archives, 6 MB in all), `analytics_events` 6.6 MB,
      `audit_log` 0.4 MB. Postgres runs with `shared_buffers` 128 MB, so its
      ~730 MB of RAM is mostly the document files held in the file cache:
      confirms step 4. All 12 backups have `offsite_status = ok`.
- [ ] **4. Stop the backup reading every file every night** (code, Claude).
      Saves ≈ $3–4. Store each document's SHA-256 and size in their own
      columns when it is uploaded (backfilled once), and let the backup read
      those instead of the file bytes. Same backups, same restores; the
      nightly read drops from 400+ MB to a few MB. Tested on a local Postgres.
      **Built and tested 2026-11-13, not yet deployed**: `document_file_hashes`
      + trigger (safety/pg-install.js), backup and restore read it
      (safety/backups.js). On a local Postgres: old files backfilled, upload /
      replace / rename / delete keep it right, change log unchanged, archive
      rows identical to the old read, a deleted file restores; the read of 44
      files went from 40.5 MB of pages to almost none. The first start after
      the deploy hashes the existing files once (~478 MB, a few seconds).
      Check Postgres's Memory graph in the days after.
- [x] **Extra: Analýza › Dokumenty** (2026-11-13, not yet deployed): every
      file with its owner, size, duplicates, deleted files kept for a
      restore and the monthly storage cost, with filters, sorting, download
      and delete. See CLAUDE.md › Dokumenty.
- [ ] **5. Cap Postgres's memory** (you, Railway › Postgres › Settings ›
      resource limits, if the Hobby plan offers it there; after step 4).
      Saves the rest of Postgres's file cache. Start at 512 MB and watch the Memory graph for a week; Postgres
      itself needs ~150–250 MB here. Too low a limit restarts the database,
      so not below 384 MB.
- [ ] **6. Make the off-site backup copy (R2) certain** (you set the
      variables, Claude checks). `SAFETY_AND_BACKUPS.md` › "Setting up the
      off-site copy". Saves nothing, but it is what lets anything else be
      trimmed safely; until it works, the copies inside Postgres are the only
      backups.
      **Mostly done**: on 2026-11-13 all 12 stored backups were copied
      off-site (`offsite_status = ok`). Still worth one trial restore from
      R2 with `restore-cli.js` against a local Postgres (dry run).
- [ ] **7. Move the two static sites to Cloudflare Pages** (code + config
      Claude, DNS you). Saves ≈ $2.60. app.waltersystem.cz and
      form.waltersystem.cz, free there. `client/public/serve.json`'s rewrites
      (`/stahnout`, the SPA catch-all) become a `_redirects` file. The Railway
      services are then paused like Period 0, not deleted.
- [ ] **8. Slim the back-end** (code, Claude). Saves ≈ $0.50–1. Build the
      backup archive table by table instead of one huge string, load
      pdfmake / exceljs / docx / unpdf only when Jarvis makes or reads a file,
      and cap Node's heap (`NODE_OPTIONS=--max-old-space-size=…`, measured
      first).
- [ ] **9. Set a usage alert** (you, Railway › Usage › Set limits): an e-mail
      alert at $8, **no hard limit** (a hard limit switches the app off).
- [ ] **10. Check after a week** in Railway › Usage › Cost by Service and
      update this table.

Target: about **$5–6 of usage a month**, which the Hobby plan's included $5
mostly covers, so a bill of about **$5–7** instead of $21.
