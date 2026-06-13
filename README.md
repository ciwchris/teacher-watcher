# Teacher Job Watch

Checks the Spokane Public Schools careers site once a day for **Certificated &rsaquo; Teacher**
postings and emails you whenever a **new** one appears. Runs entirely on GitHub Actions —
no server, no hosting cost, nothing to run locally.

- Filtered listings it watches:
  <https://www.schooljobs.com/careers/spokaneschools?department[0]=Certificated&category[0]=Teacher&sort=PostingDate%7CDescending>
- Schedule: **2:00 PM Pacific daily** (`21:00 UTC`; it becomes 1:00 PM during winter
  because GitHub cron doesn't follow daylight saving). GitHub may delay a run by 10–60+ min.

## How it works

1. A scheduled GitHub Action loads the page in a headless Chrome (the listings are
   rendered by JavaScript, so a plain download wouldn't see them).
2. `check.mjs` compares the current postings against `seen.json` (the ones already reported).
3. If there are new postings, it emails you the titles + links.
4. The updated `seen.json` is committed back to the repo, so each posting is reported once.
   (That daily commit also keeps the repo "active," so GitHub won't auto-disable the cron.)

The very first run sends a one-time **"monitoring is active"** confirmation email and records
the current board as the baseline — so you don't get spammed with every existing posting.

## One-time setup (~5 minutes)

### 1. Create a Gmail App Password (the account that will *send* the email)

App passwords require 2-Step Verification to be on.

1. Turn on 2-Step Verification: <https://myaccount.google.com/signinoptions/two-step-verification>
2. Create an app password: <https://myaccount.google.com/apppasswords>
   - Name it e.g. `teacher-job-watch`. Google shows a 16-character password — copy it
     (you won't see it again). Spaces don't matter.

### 2. Put the code on GitHub

```bash
git init
git add .
git commit -m "Teacher job watch"
# create an empty repo on github.com first, then:
git remote add origin https://github.com/<you>/teacher-job-watch.git
git branch -M main
git push -u origin main
```

### 3. Add the three secrets

In the repo: **Settings → Secrets and variables → Actions → New repository secret**. Add:

| Secret name     | Value                                                        |
| --------------- | ------------------------------------------------------------ |
| `MAIL_USERNAME` | the sending Gmail address, e.g. `you@gmail.com`              |
| `MAIL_PASSWORD` | the 16-character app password from step 1                   |
| `MAIL_TO`       | where the alerts go (your wife's email; can be any address) |

### 4. Test it

- Go to the **Actions** tab → **Check teacher postings** → **Run workflow**.
- The first run sends the confirmation email and seeds `seen.json`. After that you'll
  only be emailed when a genuinely new teacher posting shows up.

## Adjusting things

- **Time of day:** edit the `cron:` line in `.github/workflows/check.yml`. The value is
  UTC; subtract 7 hours for PDT / 8 for PST.
- **What it watches:** change `LISTINGS_URL` in `scrape.mjs` to a different filtered URL
  (e.g. a different department/category) — copy the URL from the site after applying
  filters in your browser.
- **Test locally:** `npm install && npx playwright install chromium && node check.mjs`
  (delete `seen.json` first to simulate a first run).
