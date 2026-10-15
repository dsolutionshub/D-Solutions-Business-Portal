# Operating the portal

Day-to-day running: backups, restores, key rotation, monitoring, and the free-tier limits to watch.
Commands run from the repository folder after `npx wrangler login`.

## Backups

Two layers protect the data:

| What                                       | How far back                                       | When to use it                                                              |
| ------------------------------------------ | -------------------------------------------------- | --------------------------------------------------------------------------- |
| **D1 Time Travel** (built into Cloudflare) | any minute, last 7 days (free plan)                | "Undo" a mistake in production: a bad import, wrong deletion, broken deploy |
| **Weekly encrypted export** (`backup.yml`) | 90 days (GitHub) and as long as you keep them (R2) | Disaster recovery, or copying production into staging                       |

### Weekly export

`.github/workflows/backup.yml` runs every Monday at 02:00 IST. You can also start it from GitHub →
_Actions → Backup → Run workflow_. It:

1. exports the production database (`wrangler d1 export`) into a private temp folder;
2. writes `counts-<time>.json`, the number of rows in each table;
3. encrypts the export with [age](https://age-encryption.org) for the public key in
   `backup/age-recipient.txt`, then overwrites and deletes the plaintext;
4. uploads `d1-production-<time>.sql.age` and the counts file as a workflow artifact (kept 90 days)
   **and** to the private R2 bucket `dsol-portal-backups/d1/`.

An unencrypted export is never uploaded. If `backup/age-recipient.txt` doesn't hold a real public
key, the workflow fails on purpose.

**The private key** (`dsol-backup-key.txt`, from `npm run backup:keygen`) is the only way to open a
backup. Keep two offline copies (password manager + USB in a safe). If it is lost, make a new pair
and commit the new public key. Older backups then stay unreadable, so keep the old key while you
still need them.

Download a backup:

- **GitHub:** _Actions → Backup → the run → Artifacts_.
- **R2:** `cd server && npx wrangler r2 object get dsol-portal-backups/d1/<file> --file <file> --remote`.

### Time Travel (production "undo")

```bash
cd server
# 1. what time to go back to (UTC); this shows the bookmark for that moment
npx wrangler d1 time-travel info DB --env production --timestamp "2026-10-19T08:00:00Z"
# 2. restore the whole database to that moment (it prints a bookmark to undo the restore itself)
npx wrangler d1 time-travel restore DB --env production --timestamp "2026-10-19T08:00:00Z"
```

Everything written after that moment is lost, so tell the team first. Note the "undo" bookmark it
prints. The Worker keeps running; reload the app afterwards.

## Restore

```bash
npm run restore -- --env staging \
  --file d1-production-20261019T203000Z.sql.age \
  --identity D:\safe\dsol-backup-key.txt \
  --counts counts-20261019T203000Z.json
```

It decrypts in memory, **replaces everything** in the target database, loads the backup (tables,
then rows, then indexes), and checks every table's row count against the counts file. The
plaintext never stays on disk. Restoring over **production** additionally needs
`--i-understand-this-replaces-production`; use Time Travel for production whenever it still
reaches back far enough.

The backup holds secrets only as ciphertext. After restoring into another environment, they can
be revealed there only if that environment has the **same `ENCRYPTION_KEY`**. Staging has its own
key, so after a restore drill, reveals on staging show "Could not decrypt". That's expected, and
it shows the key matters.

### Restore drill (do this once before go-live, then twice a year)

There is no staging copy, so the drill restores a real production backup into a **separate local
database on your computer** (`server/drill/`). Production is never touched.

1. Run the backup: GitHub → _Actions → Backup → Run workflow_. Download the artifact and unzip it.
2. Create the empty drill database once:
   `cd server && npx wrangler d1 migrations apply DB --local -c drill/wrangler.toml && cd ..`
3. Restore into it:
   ```bash
   npm run restore -- --local --file d1-production-<time>.sql.age --identity D:\safe\dsol-backup-key.txt --counts counts-<time>.json
   ```
4. ✅ The command ends with **"Row counts match the backup"**. That proves the backup is complete
   and your private key opens it.
5. Write down the date and the result. Delete the unzipped files afterwards.

You can rehearse the whole drill on your own machine without any Cloudflare account. It uses a
separate local database under `server/drill/`:

```bash
cd server && npx wrangler d1 migrations apply DB --local -c drill/wrangler.toml && npx wrangler d1 execute DB --local -c drill/wrangler.toml --file seed/.seed.sql && cd ..
npm run backup -- --local --out out
npm run restore -- --local --file out/d1-local-<time>.sql.age --identity <key file> --counts out/counts-<time>.json
```

## Rotating ENCRYPTION_KEY

When: once a year, when someone who could see the key leaves, or after any suspected leak. Reveals
keep working throughout, because the Worker also accepts the previous key during the change.

```bash
npm run gen:key                                   # the NEW key → password manager: "Portal ENCRYPTION_KEY (production, from <date>)"
cd server
npx wrangler secret put ENCRYPTION_KEY_PREVIOUS --env production   # paste the CURRENT (old) key
npx wrangler secret put ENCRYPTION_KEY          --env production   # paste the NEW key
cd ..
# dry run: decrypts every secret with the old key, changes nothing
OLD_KEY=<old key> NEW_KEY=<new key> npm run rotate-key -- --env production
# re-encrypt every secret with the new key and verify all of them
OLD_KEY=<old key> NEW_KEY=<new key> npm run rotate-key -- --env production --apply
cd server && npx wrangler secret delete ENCRYPTION_KEY_PREVIOUS --env production && cd ..
```

On Windows PowerShell, set the keys first (`$env:OLD_KEY="…"; $env:NEW_KEY="…"`), then run the
command, then `Remove-Item Env:OLD_KEY, Env:NEW_KEY`. The script reads keys only from environment
variables, never from arguments, so they don't land in your shell history. Rotate staging the same
way with `--env staging`.

The dry run stops without changing anything if any row doesn't decrypt. If `--apply` reports a
problem, leave `ENCRYPTION_KEY_PREVIOUS` in place: everything still works, and you can look into
it calmly. Backups taken before the rotation contain the old ciphertext, so keep the old key in the
password manager as long as you keep those backups.

## Monitoring

- **Daily job watchdog.** Each run of the daily job (08:00 IST) checks that the previous one ran
  within 26 hours. If not, or if the run had errors, all Admins get an email "Action needed: the
  portal's daily job had a problem" (at most one a day). Settings → Data lists the recent runs and
  their problems.
- **Health check.** `GET /api/health` answers without sign-in and shows only ok flags:
  `{"ok":true,"version":"<commit>","checks":{"database":"ok","dailyJob":"ok"}}`. It returns HTTP
  503 if the database doesn't answer or the daily job is stale or failing.
  `.github/workflows/health.yml` calls it every 6 hours, and GitHub emails you when it fails.
  This catches the case where the job never runs at all.
- **Logs.** _Workers & Pages → dsol-portal-api → Logs_ (Workers Logs are on in `wrangler.toml`),
  or live: `cd server && npx wrangler tail --env production`. Every request is one JSON line
  (`requestId`, method, path, status, ms, user id). Errors include the message and stack, never
  request bodies or secrets. When someone reports "Something went wrong (reference abc123…)",
  search the logs for that reference.
- **Email quota.** Settings → Data → _Emails sent today_ shows the count against the daily limit.
  The Email Center warns from 80%, and sending stops at the limit.

What to do when the health check or the Admins' email fires:

1. Settings → Data → _Recent runs_: what does the last run say?
2. _Workers & Pages → dsol-portal-api → Logs_: filter on `level = error`.
3. Missing runs: _Workers & Pages → dsol-portal-api → Settings → Triggers_ must list
   `30 2 * * *` and `*/15 * * * *`. Redeploy (`npm run deploy:server:prod`) if they're missing.
4. Fix, then Settings → Data → **Run now**. Running it again never re-sends reminders that already
   went out.

## Free-tier limits to watch

| Service           | Free limit (at the time of writing)            | Our typical use                                      | If exceeded                                                                                                 |
| ----------------- | ---------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Workers requests  | 100,000 / day                                  | a few thousand (staff × pages × ~5 calls)            | requests fail with 429 until midnight UTC → upgrade to Workers Paid (US$5/month)                            |
| Workers CPU       | 10 ms per request                              | ~1–5 ms (D1 wait time doesn't count)                 | "Exceeded CPU" errors in logs (most likely on Reports or the daily job) → Workers Paid                      |
| CPU at sign-in    | 10 ms per request (free)                       | ~20 ms per sign-in (password hashing)                | sign-ins fail with "exceeded CPU" → Workers Paid, or lower `PBKDF2_ITERATIONS` (DEPLOY step 4)              |
| Cron Triggers     | 5 per account                                  | 2 (production)                                       | don't add more                                                                                              |
| D1 reads          | 5 million rows / day                           | well under 100k                                      | queries fail until midnight UTC → Workers Paid raises it 5×+                                                |
| D1 writes         | 100,000 rows / day                             | a few hundred                                        | as above                                                                                                    |
| D1 storage        | 5 GB (500 MB per database)                     | a few MB                                             | archive old emails/audit rows, or Workers Paid                                                              |
| D1 Time Travel    | 7 days                                         | —                                                    | weekly encrypted exports cover older points                                                                 |
| R2                | 10 GB storage, 1M writes and 10M reads / month | logos + backups (MBs)                                | delete old backups from `dsol-portal-backups` (keep ≥ 8 weekly)                                             |
| Netlify (the app) | 100 GB bandwidth, 300 build minutes / month    | small (one ~600 kB app; ~2 min per build)            | builds pause until next month → fewer pushes, or Netlify Pro                                                |
| Cloudflare Access | 50 users                                       | the team                                             | Zero Trust paid plan                                                                                        |
| Brevo             | 300 emails / day (counted per recipient)       | digests + client emails                              | the portal stops sending at the limit you set (Settings) and warns from 80%; raise it after upgrading Brevo |
| GitHub Actions    | 2,000 minutes / month (private repo)           | ~10 min per deploy, ~1 min per backup / health check | fewer pushes, or make the repository public (not recommended)                                               |

Check actual usage in the Cloudflare dashboard: _Workers & Pages → Overview_, _D1 → the database
→ Metrics_, _R2 → Overview_. Limits change; confirm them on Cloudflare's and Brevo's pricing pages.
