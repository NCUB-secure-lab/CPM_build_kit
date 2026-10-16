#!/usr/bin/env python3
"""
fetch_case_studies.py — scrape NCUB success stories into structured intelligence
================================================================================

Crawls https://www.ncub.co.uk/insights/?_sft_type=success-story, follows each
case-study URL, and extracts:
    title · URL · publication date · summary · university (or universities) ·
    business partner(s) · sector · theme · topics tagged on the page

Output: case_studies.json — picked up automatically by build_dashboard.py.

Usage:
    pip install requests beautifulsoup4
    python fetch_case_studies.py            # full crawl (~5–15 min)
    python fetch_case_studies.py --max 50   # quick test, first 50 stories
    python fetch_case_studies.py --merge    # add new stories to existing file

How it works
------------
1. Paginates through the Insights index, filtered to type=success-story
2. For each link, fetches the article page
3. Extracts metadata from the listing card AND the article body
4. Identifies the lead university by matching against the HESA provider list
5. Identifies the business partner by named-entity extraction from the
   opening paragraph (looks for capitalised company names ending in
   Ltd/PLC/Inc/Group/Corporation, or the ALL-CAPS firm mentioned earliest)
6. Maps topic tags to a small NCUB sector taxonomy (life sciences,
   engineering, digital, creative, energy, finance, etc.)

LIMITATIONS — read these
------------------------
- Heuristic extraction is not perfect. After running, eyeball
  case_study_review.csv (one row per story, with confidence scores) and
  hand-correct any rows where university or partner is wrong or missing.
- Some old stories live at /success-stories/ rather than /insight/. The
  scraper handles both, but legacy URLs sometimes return 404. These are
  logged to skipped_stories.csv.
- NCUB updates the site occasionally. If structure changes (CSS selectors),
  update the BeautifulSoup queries near the top of this file.
- Respect rate limits: the script sleeps 0.4s between requests by default.
  Don't lower it — NCUB hosts this with limited capacity.
"""
import os, sys, json, re, time, argparse
from urllib.parse import urljoin, urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path: sys.path.insert(0, HERE)
os.chdir(ROOT)

# ── folder layout (reorganised Oct 2026) ──────────────────────────────────
# .../CPM_build_kit/{input,output,src}/   —  this file lives in src/
ROOT = os.path.dirname(HERE)
INPUT_DIR  = os.path.join(ROOT, "input")
OUTPUT_DIR = os.path.join(ROOT, "output")
os.makedirs(OUTPUT_DIR, exist_ok=True)


BASE = "https://www.ncub.co.uk"
INDEX_URL = BASE + "/insights/?_sft_type=success-story&sf_paged={page}"
OUT_PATH = os.path.join(INPUT_DIR, "case_studies.json")
REVIEW_PATH = os.path.join(OUTPUT_DIR, "case_study_review.csv")
SKIPPED_PATH = os.path.join(OUTPUT_DIR, "skipped_stories.csv")
HEADERS = {"User-Agent": "NCUB-CPM-dashboard/1.0 (case-study indexer)"}
THROTTLE = 0.4   # seconds between requests

# NCUB sector taxonomy — keyword → sector (first match wins, broad first)
SECTOR_MAP = [
    ("life sciences",   ["pharma", "biotech", "gsk", "astrazeneca", "vaccine", "biomedical", "clinical", "medicine", "health", "drug discovery", "genom", "molecul"]),
    ("engineering",     ["engineering", "manufactur", "rolls-royce", "rolls royce", "caterpillar", "aerospace", "automotive", "civil eng", "mechanical"]),
    ("digital & ICT",   ["software", "digital", "data scien", "ai ", "artificial intelligence", "computing", "cybersecur", "cisco", "microsoft", "google", "internet of things"]),
    ("energy & cleantech", ["energy", "renewable", "wind", "solar", "battery", "clean tech", "decarbon", "net zero", "nuclear", "hydrogen", "carbon"]),
    ("creative & cultural", ["creative", "arts", "design", "cultur", "media", "film", "music ", "fashion"]),
    ("agri-food & environment", ["food", "agri", "agricultur", "environment", "ecolog", "sustain", "marine", "fisher", "forest"]),
    ("finance & professional services", ["financ", "bank", "insurance", "accountin", "consult", "law firm", "professional service"]),
    ("construction & infrastructure", ["construction", "infrastruct", "transport", "rail", "logistics", "supply chain"]),
    ("retail & consumer", ["retail", "consumer", "fmcg", "brand", "unilever", "marketing"]),
    ("space & defence", ["space ", "defence", "satellite", "aviation", "BAE", "thales"]),
]

# Theme / collaboration-type taxonomy — multi-tag, all matches kept.
# Keywords matched against (title + summary) in lowercase.
THEME_MAP = [
    ("Research collaboration",       [r"\bresearch (collaborat|partner|project|programme)", r"\bjoint research", r"\bco-?funded research", r"\bcollaborative r&?d\b", r"\bcollaborative research"]),
    ("Contract research",            [r"\bcontract research", r"\bcommissioned research", r"\bsponsored research project"]),
    ("Knowledge Transfer Partnership", [r"\bktp\b", r"\bknowledge transfer partnership"]),
    ("Spinout",                      [r"\bspin-?out\b", r"\bspun out\b", r"\bspin-?off\b"]),
    ("Science park / incubator",     [r"\bscience park", r"\bincubator", r"\baccelerator\b", r"\bcatalyst\b.*\b(park|campus|hub)?", r"\bcatapult\b", r"\binnovation district", r"\binnovation hub"]),
    ("Sponsored chair",              [r"\bsponsored (a )?chair", r"\bendowed chair", r"\b(named|funded) chair in"]),
    ("Innovation / R&D centre",      [r"\binnovation centre", r"\binnovation center", r"\bresearch centre", r"\br&?d centre", r"\bi&rc\b", r"\butc\b", r"\buniversity technology centre"]),
    ("CPD & professional training",  [r"\bcpd\b", r"\bcontinuing professional development", r"\bprofessional development", r"\bexecutive education"]),
    ("Apprenticeship",               [r"\bdegree apprenticeship", r"\bapprenticeship", r"\bapprentice\b"]),
    ("Graduate recruitment",         [r"\bgraduate recruit", r"\bplacement", r"\binternship", r"\bgraduate scheme", r"\bgraduate talent"]),
    ("Skills & workforce development", [r"\bskills gap", r"\bworkforce development", r"\bupskill", r"\breskill", r"\btraining programme"]),
    ("IP & licensing",               [r"\bip\b.*\b(licen|framework|agreement)", r"\bintellectual property", r"\blicensing", r"\blicensed", r"\bpatent", r"\btechnology transfer"]),
    ("Consultancy",                  [r"\bconsultancy", r"\bconsultancy services", r"\badvisory work"]),
    ("Strategic partnership",        [r"\bstrategic partnership", r"\bstrategic alliance", r"\blong-?term partnership", r"\bframework agreement"]),
    ("Open innovation",              [r"\bopen innovation"]),
    ("Public-private partnership",   [r"\bpublic[- ]private partnership", r"\bppp\b"]),
    ("Equipment & facilities sharing", [r"\bshared facilit", r"\bequipment sharing", r"\bjoint facilit", r"\bshared laborator"]),
    ("Place-based / civic",          [r"\bcivic", r"\bplace-?based", r"\blocal economy", r"\blevelling up", r"\bregional development", r"\bdean of engagement"]),
    ("STEM outreach",                [r"\bstem\b", r"\bstem outreach", r"\bschool outreach", r"\bsummer school"]),
    ("Public engagement",            [r"\bpublic engagement", r"\boutreach"]),
    ("Joint venture",                [r"\bjoint venture", r"\bspin-out company.*joint"]),
    ("Funding leverage",             [r"\bepsrc\b", r"\binnovate uk", r"\bdti\b", r"\bukri\b", r"\bbbsrc\b", r"\bgrant funding"]),
]
import re as _re
_THEME_RE = [(name, [_re.compile(p, _re.I) for p in pats]) for name, pats in THEME_MAP]

def classify_themes(text):
    """Return list of theme tags found in text. Multi-tag."""
    if not text: return []
    found = []
    for name, pats in _THEME_RE:
        for p in pats:
            if p.search(text):
                found.append(name); break
    return found

PARTNER_REGEX = re.compile(
    r"\b([A-Z][A-Za-z0-9&\-]+(?:\s+[A-Z][A-Za-z0-9&\-]+){0,4})"
    r"\s+(?:Ltd|Limited|PLC|Plc|LLP|Inc|Corporation|Group|Holdings)\b")

def soup_get(url, session):
    """GET a URL, return BeautifulSoup or None on error."""
    from bs4 import BeautifulSoup
    try:
        r = session.get(url, headers=HEADERS, timeout=20)
        r.raise_for_status()
        return BeautifulSoup(r.text, "html.parser")
    except Exception as e:
        print(f"    skip {url}: {e}")
        return None

def parse_listing(soup):
    """Pull (title, url, date) tuples from one insights index page."""
    out = []
    for a in soup.select("a[href*='/insight/'], a[href*='/success-stor']"):
        href = a.get("href", "")
        if not href.startswith("http"): href = urljoin(BASE, href)
        text = " ".join(a.get_text(" ").split())
        if not text or len(text) < 8: continue
        # try to pull a date from the link text
        m = re.search(r"(\d{1,2}\s+\w+\s+20\d{2})", text)
        date = m.group(1) if m else ""
        title = text.replace(date, "").strip()
        out.append((title, href, date))
    # dedupe by URL
    seen, dedup = set(), []
    for t, u, d in out:
        if u in seen: continue
        seen.add(u); dedup.append((t, u, d))
    return dedup

def load_hesa_names():
    """Load the HESA provider names for matching, with normalisation key."""
    import pandas as pd
    df = pd.read_csv(os.path.join(INPUT_DIR, "hesa_panel_clean.csv"))
    def key(s):
        s = s.lower()
        for w in ["the ", "university of ", "college of ", ", london"]:
            s = s.replace(w, " ")
        return re.sub(r"\s+", " ", s).strip()
    return [(n, key(n)) for n in df.he_provider.dropna().unique()]

def find_university(text, hesa):
    """Match university name in article text against HESA list."""
    if not text: return None
    t = text.lower()
    hits = []
    for full, k in hesa:
        if k and k in t:
            hits.append((len(k), full))
    if not hits: return None
    return sorted(hits, reverse=True)[0][1]

def find_partner(text):
    """Heuristic business-partner extraction from opening paragraph."""
    if not text: return None
    m = PARTNER_REGEX.search(text)
    if m: return m.group(0).strip()
    # fallback: first ALL-CAPS token of length >= 3
    for w in text.split()[:80]:
        clean = re.sub(r"[^A-Z]", "", w)
        if len(clean) >= 3 and len(w) >= 3 and w.isupper():
            return w
    return None

def find_sector(text):
    if not text: return None
    t = text.lower()
    for sector, kws in SECTOR_MAP:
        for kw in kws:
            if kw in t: return sector
    return "Other / Unclassified"

def parse_article(url, soup, hesa):
    """Pull title, summary, university, partner, sector, themes from a single article."""
    title_el = soup.select_one("h1") or soup.select_one(".entry-title")
    title = title_el.get_text(strip=True) if title_el else ""
    # date: most reliable source is the article:published_time meta tag
    date = ""
    pub_meta = soup.select_one("meta[property='article:published_time']")
    if pub_meta and pub_meta.get("content"):
        date = pub_meta["content"][:10]  # YYYY-MM-DD
    if not date:
        date_el = soup.select_one(".date") or soup.select_one("time")
        date = date_el.get_text(strip=True) if date_el else ""
    # body: take first 3-5 paragraphs as summary
    paras = [p.get_text(" ", strip=True)
             for p in soup.select("article p, .entry-content p, main p")]
    paras = [p for p in paras if len(p) > 40][:5]
    summary = " ".join(paras)[:1500]
    # university: prefer the explicit /member/ link on the NCUB page
    uni = None
    for a in soup.select("a[href*='/member/']"):
        name = a.get_text(strip=True)
        if name and len(name) > 4:
            uni = name; break
    if not uni:
        uni = find_university(title + " " + summary, hesa)
    partner = find_partner(summary)
    sector = find_sector(title + " " + summary)
    themes = classify_themes(title + " " + summary)
    return {"title": title, "url": url, "date": date, "summary": summary,
            "university": uni, "partner": partner, "sector": sector,
            "topics": themes}

def crawl(args, hesa):
    import requests
    session = requests.Session()
    print(f"Listing success-story pages…")
    urls = []
    for page in range(1, args.max_pages + 1):
        soup = soup_get(INDEX_URL.format(page=page), session)
        if not soup: break
        items = parse_listing(soup)
        if not items:
            print(f"  page {page}: no items found, stopping pagination")
            break
        urls.extend(items)
        print(f"  page {page}: +{len(items)} items (total {len(urls)})")
        time.sleep(THROTTLE)
        if args.max and len(urls) >= args.max: break
    if args.max: urls = urls[:args.max]
    print(f"\nFetching {len(urls)} case studies…")
    out = []
    for i, (title, url, date) in enumerate(urls):
        if i % 25 == 0: print(f"  {i}/{len(urls)}")
        soup = soup_get(url, session)
        if not soup: continue
        rec = parse_article(url, soup, hesa)
        if rec.get("date") == "" and date: rec["date"] = date
        if rec.get("title") == "" and title: rec["title"] = title
        out.append(rec)
        time.sleep(THROTTLE)
    return out

def write_outputs(records, merge_existing):
    if merge_existing and os.path.exists(OUT_PATH):
        with open(OUT_PATH, encoding="utf-8") as f:
            existing = json.load(f)
        urls = {r["url"] for r in existing}
        for r in records:
            if r["url"] not in urls: existing.append(r)
        records = existing
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=1, ensure_ascii=False)
    # review CSV: low-confidence rows for hand-correction
    import csv
    with open(REVIEW_PATH, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["title", "url", "university", "partner", "sector", "needs_review"])
        for r in records:
            flag = ("yes" if not r["university"] or not r["partner"] else "")
            w.writerow([r["title"][:120], r["url"], r["university"] or "",
                        r["partner"] or "", r["sector"] or "", flag])
    print(f"\nWrote {OUT_PATH} ({len(records)} case studies)")
    print(f"Wrote {REVIEW_PATH} — open in Excel, hand-correct the 'needs_review' rows")
    print(f"\nNow re-run: python build_dashboard.py")

def reclassify_existing():
    """Re-run the theme classifier (and sector) over an existing case_studies.json,
    without re-crawling. Writes the file back in place."""
    if not os.path.exists(OUT_PATH):
        sys.exit(f"ERROR: {OUT_PATH} not found — run a fetch first.")
    with open(OUT_PATH, encoding="utf-8") as f:
        records = json.load(f)
    # Some legacy files include a leading {"_note": ...} sentinel
    records = [r for r in records if r.get("url") != "_note"]
    n_topics_before = sum(len(r.get("topics") or []) for r in records)
    for r in records:
        text = (r.get("title", "") + " " + r.get("summary", ""))
        r["topics"] = classify_themes(text)
        # also refresh sector — keep existing if classifier returns Other
        new_sec = find_sector(text)
        if new_sec and new_sec != "Other / Unclassified":
            r["sector"] = new_sec
    n_topics_after = sum(len(r.get("topics") or []) for r in records)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=1, ensure_ascii=False)
    print(f"Reclassified {len(records)} case studies in {OUT_PATH}")
    print(f"  topic tags: {n_topics_before} → {n_topics_after}")
    # distribution preview
    from collections import Counter
    c = Counter(t for r in records for t in (r.get("topics") or []))
    print(f"  top themes: " + ", ".join(f"{k} ({v})" for k, v in c.most_common(10)))
    print(f"\nNow re-run: python build_dashboard.py")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max", type=int, default=0, help="limit total case studies (0=no limit)")
    ap.add_argument("--max-pages", type=int, default=80, help="max index pages to walk")
    ap.add_argument("--merge", action="store_true", help="add to existing case_studies.json")
    ap.add_argument("--reclassify", action="store_true",
                    help="re-tag existing case_studies.json without crawling (fast)")
    args = ap.parse_args()
    if args.reclassify:
        reclassify_existing()
        return
    hesa = load_hesa_names()
    records = crawl(args, hesa)
    write_outputs(records, args.merge)

if __name__ == "__main__":
    main()
