// check.mjs
// Orchestrates one daily check:
//   1. Scrape the current teacher postings.
//   2. Compare against seen.json (the postings we've already reported).
//   3. If there are new postings, write the email body + signal the workflow to send it.
//   4. Update seen.json so we don't report the same posting twice.
//
// Outputs (for the GitHub Action) are written to the file named by $GITHUB_OUTPUT:
//   has_new=true|false   -> whether the send-email step should run
//   subject=<line>       -> the email subject
// The email body (HTML) is written to email_body.html.

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { scrapeJobs, LISTINGS_URL } from "./scrape.mjs";

const SEEN_FILE = "seen.json";
const BODY_FILE = "email_body.html";

async function loadSeen() {
  if (!existsSync(SEEN_FILE)) return { ids: [], firstRun: true };
  try {
    const raw = JSON.parse(await readFile(SEEN_FILE, "utf8"));
    const ids = Array.isArray(raw?.ids) ? raw.ids : [];
    // A file that exists but holds an empty list is still the initial baseline.
    return { ids, firstRun: ids.length === 0 };
  } catch {
    return { ids: [], firstRun: true };
  }
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderJobList(jobs) {
  const items = jobs
    .map(
      (j) =>
        `    <li style="margin-bottom:10px;">` +
        `<a href="${escapeHtml(j.url)}" style="font-size:16px;">${escapeHtml(j.title)}</a>` +
        `</li>`
    )
    .join("\n");
  return `  <ul style="padding-left:20px;">\n${items}\n  </ul>`;
}

async function setOutput(key, value) {
  const out = process.env.GITHUB_OUTPUT;
  if (!out) return; // running locally
  await writeFile(out, `${key}=${value}\n`, { flag: "a" });
}

async function main() {
  const jobs = await scrapeJobs();
  console.log(`Scraped ${jobs.length} current teacher posting(s).`);

  const { ids: seenIds, firstRun } = await loadSeen();
  const seen = new Set(seenIds);
  const newJobs = jobs.filter((j) => !seen.has(j.id));

  // Always remember every id we've ever seen (tiny, and avoids re-reporting a
  // posting that briefly drops off the list and comes back).
  const updatedIds = [...new Set([...seenIds, ...jobs.map((j) => j.id)])];
  await writeFile(SEEN_FILE, JSON.stringify({ ids: updatedIds }, null, 2) + "\n");

  if (firstRun) {
    // First ever run: don't dump the entire existing board as "new". Send a single
    // confirmation email so they know monitoring is live, then seed the baseline.
    const body =
      `<p>✅ Monitoring is now active for Spokane Public Schools ` +
      `<strong>Certificated &rsaquo; Teacher</strong> postings.</p>` +
      `<p>There are currently <strong>${jobs.length}</strong> posting(s). ` +
      `From now on you'll only get an email when a <em>new</em> one appears.</p>` +
      (jobs.length ? `\n<p>Current postings:</p>\n${renderJobList(jobs)}` : "") +
      `\n<p style="color:#888;font-size:12px;">Source: <a href="${escapeHtml(
        LISTINGS_URL
      )}">${escapeHtml(LISTINGS_URL)}</a></p>`;
    await writeFile(BODY_FILE, body);
    await setOutput("has_new", "true");
    await setOutput("subject", "✅ Teacher job monitoring is active");
    console.log("First run: wrote confirmation email, seeded baseline.");
    return;
  }

  if (newJobs.length === 0) {
    await setOutput("has_new", "false");
    console.log("No new postings. Nothing to send.");
    return;
  }

  const n = newJobs.length;
  const subject = `🍎 ${n} new Spokane teacher posting${n > 1 ? "s" : ""}`;
  const body =
    `<p>${n} new <strong>Certificated &rsaquo; Teacher</strong> posting${
      n > 1 ? "s" : ""
    } at Spokane Public Schools:</p>\n` +
    renderJobList(newJobs) +
    `\n<p style="color:#888;font-size:12px;">See all: <a href="${escapeHtml(
      LISTINGS_URL
    )}">the full filtered listings</a></p>`;
  await writeFile(BODY_FILE, body);
  await setOutput("has_new", "true");
  await setOutput("subject", subject);

  console.log(`Found ${n} new posting(s):`);
  for (const j of newJobs) console.log(`  [${j.id}] ${j.title}`);
}

main().catch((err) => {
  console.error("Check failed:", err.stack || err.message);
  process.exit(1);
});
