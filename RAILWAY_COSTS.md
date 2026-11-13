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

## Expected costs, before and after

Monthly, at 22,1 Kč/$. The bill is usage + 21 % VAT once usage passes the
plan's included $5; below that it is the $5 fee + VAT.

| | Usage | Bill (with VAT) | Kč | Change |
|---|---|---|---|---|
| Before (12 Oct – 12 Nov) | $17.30 | $20.89 | ≈ 462 Kč | — |
| **Now** (Period 0 paused, backup fix; Postgres back to ~0.28–0.35 GB) | ≈ $7.9 | **≈ $9.5** | **≈ 210 Kč** | **−55 %** |
| + step 7 (static sites on Cloudflare Pages) | ≈ $5.3 | ≈ $6.4 | ≈ 141 Kč | −70 % |
| + steps 5 and 8 (Postgres cap, slimmer back-end) | ≤ $5 | $6.05 (floor) | ≈ 134 Kč | −71 % |
| Before June, for comparison | < $5 | the floor | ≈ 100–130 Kč | |

"Now" per service: Postgres ≈ $3.0 (was $7.66), Back-End $2.26, Front-End
$1.96, Public Form Page $0.64; Period 0 ($2.86) and the deleted services
($1.93) are gone. Postgres's new level is an estimate until its Memory graph
settles: every 0.1 GB it holds is ≈ $1 a month. The floor ($5 + VAT) is the
Hobby plan's minimum; nothing below it is possible on Railway.

Storing the files themselves is cheap: 456 MB on the disk ≈ 1,5 Kč a month,
and the R2 copies are free up to 10 GB. They cost money only while held in
memory (≈ 221 Kč per GB a month), which the backup fix stopped. 245 of the
289 files (354 MB, 78 %) belong to no existing subject: mostly Neveřejné
subjects 7–39, deleted before the change log (October 2026), plus a few
pointing at the pre-2026 Veřejné tables (Analýza › Dokumenty › Bez subjektu).

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
- [x] **4. Stop the backup reading every file every night** (code, Claude).
      **Deployed 2026-11-13** (7156d4e): on the live database all 369
      documents got their hash (456 MB of files), trigger installed. The
      first backup using it is the next nightly one (2:00 Prague).
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
- [x] **Extra: Analýza › Dokumenty** (deployed 2026-11-13, 7156d4e): every
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
      **Parked 2026-11-13 ("later")**: tracked in the Walter Skill Tree as
      `perf-pages`; steps 5 and 8 as `perf-pg-memory` / `perf-backend-ram`.
      **Plan (2026-11-13):** DNS is at WEDOS (CNAMEs to `*.up.railway.app`),
      so Cloudflare only hosts the files; the CNAMEs change at WEDOS.
      Pages needs no `_redirects`: `/stahnout` serves `stahnout.html` by
      itself, and with no `404.html` every other path gets `index.html`.
      `client/public/_headers` carries serve.json's APK headers.
      1. Pages project **walter-app** from GitHub `walter-system-software`,
         branch `main`, root `client`, build `npm run build`, output `dist`,
         env `NODE_VERSION=22`, `VITE_API_URL=https://api.waltersystem.cz`,
         `VITE_GOOGLE_MAPS_API_KEY` (you paste it from Railway › Walter
         System Front-End › Variables).
      2. Pages project **walter-form**: root `public-form`, no build, output
         `.` (index.html + field-options.json; the form calls the API by
         itself).
      3. Check both on their `*.pages.dev` address (the API allows any
         origin, so login works there too).
      4. Custom domains in Pages (app. and form.waltersystem.cz), then you
         change the two CNAMEs at WEDOS to `walter-app.pages.dev` /
         `walter-form.pages.dev`. No downtime: Railway answers until the DNS
         moves.
      5. A day later, pause Walter System Front-End and Public Form Page on
         Railway (remove the deployment, keep the service). Rollback = the
         CNAME back + Redeploy.
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
