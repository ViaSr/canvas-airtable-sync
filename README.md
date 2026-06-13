# Canvas → Airtable Learner-Ops Sync

A scheduled integration that pulls learner enrollment and grade data from the Canvas LMS REST API and syncs it into an Airtable base for learner-operations tracking — with cohort linking, automated at-risk flagging, run logging, and email alerting on failure.

Built with Google Apps Script (the Canvas + Airtable REST APIs, scheduled triggers, and email alerts), this mirrors the kind of LMS automation that keeps learner data flowing between systems so staff can spend their time on learners instead of spreadsheets.

## What it does

- **Reads** student enrollments from Canvas (name, user ID, current score, last activity) via the documented Canvas REST API shape.
- **Upserts** them into an Airtable `Learners` table, merging on Canvas User ID so re-runs update existing records instead of duplicating them.
- **Derives and links cohorts** from the same payload — `Cohorts` records are created and linked to learners automatically by the sync, not entered by hand.
- **Flags at-risk learners** with a self-computing formula (`Current Score < 70`) and surfaces them in a dedicated cohort-grouped view.
- **Logs every run** to a `Sync Log` table (OK/FAIL, record count, error message) for monitoring.
- **Alerts on failure** by emailing the operator with the error, while ensuring the logging path can never crash the sync itself.
- **Runs on a schedule** via a time-driven trigger (every 6 hours).

## Architecture

```
Canvas REST API  ──►  Google Apps Script  ──►  Airtable base
 (enrollments,         - fetch + transform       - Learners (upsert on Canvas User ID)
  grades, activity)    - upsert learners          - Cohorts  (auto-created + linked)
                       - derive cohorts           - Sync Log (per-run OK/FAIL)
                       - log run / alert           - At-Risk view (formula-driven)
                              │
                              ▼
                    on failure: Sync Log FAIL row + email alert
```

A single config property (`CANVAS_MODE`) switches the Canvas source between `live` and `mock`. Everything downstream — the Airtable upserts, cohort linking, formula view, logging, alerting, and schedule — runs identically in both modes.

## Data mapping

| Canvas field | Airtable field (Learners) |
|---|---|
| `user.name` | Name |
| `user_id` | Canvas User ID *(merge key)* |
| `grades.current_score` | Current Score |
| `last_activity_at` | Last Activity |
| `course_name` → linked record | Cohort *(linked to Cohorts table)* |
| *(run timestamp)* | Last Synced |

## A note on the Canvas source

This project was built against the **Canvas REST API specification** (enrollments endpoint) using a **config-swappable mock data source**, because Instructure suspended its Free-for-Teacher sandboxes — and removed API token generation — following the May 2026 security incident. The mock returns objects shaped exactly like a real Canvas enrollments response, so pointing the sync at a live Canvas instance is a one-property change (`CANVAS_MODE=live`) plus credentials, with no change to the transform, upsert, or downstream logic.

## Setup

Secrets are stored in Apps Script **Script Properties**, never in code:

| Property | Purpose |
|---|---|
| `CANVAS_MODE` | `mock` or `live` |
| `AIRTABLE_BASE_ID` | Target Airtable base |
| `AIRTABLE_TOKEN` | Airtable personal access token (scoped to one base, read+write only) |
| `ALERT_EMAIL` | Where failure alerts are sent |
| `CANVAS_BASE` / `CANVAS_TOKEN` / `CANVAS_COURSE_ID` | Live mode only |

1. Create the Airtable base with `Learners`, `Cohorts`, and `Sync Log` tables (fields per the data mapping above).
2. Create a scoped Airtable token and add it, with the other properties, to Script Properties.
3. Run `syncLearners` once and authorize the script.
4. Add a time-driven trigger on `syncLearners` (every 6 hours).

## Screenshots

*(coming shortly — Learners sync, cohort links, at-risk view, Sync Log, failure alert)*

## Design notes

- **Idempotent upserts.** Merging on Canvas User ID (and cohort Name) means the sync is safe to re-run; records update rather than duplicate.
- **Logging can't break the pipeline.** `logRun_` deliberately never throws — a failed log write is reported to the execution log but cannot crash a run — separating the failure domains of "the sync" and "logging about the sync."
- **System-owned vs. human-owned fields.** Learner records and cohort IDs are owned by the sync; cohort start dates are human-entered. The schema reflects who owns what.
- **Secrets management.** All credentials live in Script Properties; the token is scoped to a single base with read+write only, so even a leaked key has minimal blast radius.

## Known limitations / production next steps

- **Cohort identity keys on the name string** today (leaning on Airtable `typecast` to link-or-create). In production this would key on `course_id` and write real record IDs, so renaming a cohort couldn't spawn a duplicate.
- **No pagination yet** — a live integration would follow Canvas's `Link` headers for courses beyond one page.
- **Polling, not events** — production would move to incremental sync (`updated_since`) or Canvas Live Events / webhooks instead of a fixed schedule.
- **Single-file deployment** — pasted into the Apps Script editor; at scale I'd manage it with `clasp` for proper version control, and add retry-with-backoff on transient API errors.
- LTI 1.3 would be the path for deeper, standards-based Canvas integration.

---

*Built by Landon Urbain-Lozier Alison — [github.com/ViaSr](https://github.com/ViaSr)*
