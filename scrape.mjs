// scrape.mjs
// Loads the Spokane Public Schools careers page (filtered to Certificated > Teacher,
// newest first) in a headless browser and extracts the current job postings.
//
// The page is a JavaScript single-page app: the listings are loaded by script AFTER
// the initial HTML arrives, so we need a real browser to see them. We key each posting
// off its job-detail link (/careers/spokaneschools/jobs/<id>/...) rather than CSS class
// names, so the scraper survives minor restyling of the site.

import { chromium } from "playwright";

export const LISTINGS_URL =
  "https://www.schooljobs.com/careers/spokaneschools" +
  "?department[0]=Certificated&category[0]=Teacher&sort=PostingDate%7CDescending";

// Only keep postings whose title contains this text (case-insensitive). The site's
// own filters can't narrow to grade-level teaching roles, so we filter by title here.
// Set to "" to keep every teacher posting.
export const TITLE_FILTER = "TEACHER - GRADE";

function matchesTitleFilter(title) {
  if (!TITLE_FILTER) return true;
  return title.toUpperCase().includes(TITLE_FILTER.toUpperCase());
}

// Matches the numeric id in a job-detail href, e.g. /jobs/4812345/teacher-grade-3
const JOB_HREF_RE = /\/jobs\/(\d+)\b/;

// The site paginates at 10 results per page. We append &page=N to walk all pages.
const MAX_PAGES = 50; // safety cap; this board is normally 1–2 pages.

// Loads one results page and returns its postings as { id, title, url }.
// Throws if the careers app never finishes loading (so a real failure is loud, and
// is not silently confused with "there are zero openings today").
async function scrapePage(page, pageNum) {
  const url = `${LISTINGS_URL}&page=${pageNum}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });

  // Wait until EITHER job links have rendered, OR the app explicitly reports no
  // matches. If neither happens within the timeout, the load genuinely failed.
  await page.waitForFunction(
    () => {
      const hasJobs = document.querySelector('a[href*="/jobs/"]') !== null;
      const text = (document.body.innerText || "").toLowerCase();
      const saysEmpty =
        /\b0 jobs?\b/.test(text) ||
        /no jobs? (found|match)/.test(text) ||
        /did not match/.test(text);
      return hasJobs || saysEmpty;
    },
    { timeout: 45_000 }
  );

  // Give any in-flight rendering a brief moment to settle.
  await page.waitForTimeout(1500);

  return page.evaluate(() => {
    const re = /\/jobs\/(\d+)\b/;
    // For each job id, keep the anchor with the longest text (the title link,
    // not a short "Apply" link that points at the same posting).
    const best = new Map();
    for (const a of document.querySelectorAll('a[href*="/jobs/"]')) {
      const href = a.getAttribute("href") || "";
      const m = href.match(re);
      if (!m) continue;
      const id = m[1];
      const title = (a.textContent || "").trim().replace(/\s+/g, " ");
      if (!title) continue;
      const prev = best.get(id);
      if (!prev || title.length > prev.title.length) {
        best.set(id, { id, title, url: new URL(href, location.origin).href });
      }
    }
    return [...best.values()];
  });
}

/**
 * Returns an array of { id, title, url } for ALL teacher postings currently shown,
 * walking every results page. Order is preserved (newest first).
 */
export async function scrapeJobs({ headless = true } = {}) {
  const browser = await chromium.launch({ headless });
  try {
    const page = await browser.newPage({
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    });

    const all = [];
    const seen = new Set();
    for (let n = 1; n <= MAX_PAGES; n++) {
      const jobs = await scrapePage(page, n);
      // Stop when a page has no postings, or only repeats ids we've already
      // collected (e.g. the site clamps an out-of-range page back to the last one).
      const fresh = jobs.filter((j) => !seen.has(j.id));
      if (fresh.length === 0) break;
      for (const j of fresh) {
        seen.add(j.id);
        if (matchesTitleFilter(j.title)) all.push(j);
      }
      // A short page means there is no next page.
      if (jobs.length < 10) break;
    }
    return all;
  } finally {
    await browser.close();
  }
}

// Allow running directly for a quick manual check: `node scrape.mjs`
if (import.meta.url === `file://${process.argv[1]}`) {
  scrapeJobs()
    .then((jobs) => {
      console.log(`Found ${jobs.length} teacher posting(s):`);
      for (const j of jobs) console.log(`  [${j.id}] ${j.title}\n      ${j.url}`);
    })
    .catch((err) => {
      console.error("Scrape failed:", err.message);
      process.exit(1);
    });
}
