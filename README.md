# NCUB Collaboration Progress Monitor — build kit

Everything needed to regenerate the dashboard from the HESA panel data.

## Layout (reorganised October 2026)

```
CPM_build_kit/
├── input/              ← all raw and reference data (never written to)
│   ├── hesa_panel_clean.csv     HE-BCI panel, 231 providers, 2014/15–2024/25
│   ├── business_collabs.csv     Gateway to Research business collaborations
│   ├── ri_indicators.csv        GtR R&I pillar indicators (13 measures)
│   ├── ri_trends_full.csv       GtR trends time-series
│   ├── trac_groups.csv          OfS TRAC peer-group reference (160 providers)
│   ├── regions.json             UK region boundaries (ONS, pre-simplified)
│   ├── context_cache.json       Economic context data (digitised from NCUB figures)
│   ├── company_locations.json   Companies House postcode geocoding cache
│   └── case_studies.json        NCUB success stories (scraped)
├── output/             ← everything the build writes lands here
│   ├── ncub_cpm_dashboard.html  the dashboard
│   ├── case_match_audit.csv     case-study ↔ HESA matching audit
│   └── case_study_review.csv    scraper quality audit
├── src/                ← Python code and HTML templates
│   ├── build_dashboard.py       main build script (reads input/, writes output/)
│   ├── build_collabs.py         GtR business collab aggregator
│   ├── match_cases.py           fuzzy case-study → HESA matcher
│   ├── fetch_case_studies.py    NCUB web scraper (--reclassify to re-tag)
│   ├── fetch_context.py         ONS/OECD economic data fetcher
│   ├── enrich_companies.py      Companies House + postcodes.io geocoder
│   └── templates/
│       ├── part1.html           head, CSS, nav, Home + Economic context
│       ├── part2.html           Findings, Skills, Institution explorer, Case studies
│       └── part3.html           all JavaScript (renderers, charts, PDF generator)
├── .github/workflows/
│   └── update-dashboard.yml     monthly auto-rebuild on the 16th
└── README.md
```

## Run it

Anywhere with Python 3.9+ and pandas (open a terminal in `CPM_build_kit/`):

```bash
pip install pandas rapidfuzz
python src/build_dashboard.py
```

This writes `output/ncub_cpm_dashboard.html`. Open it in any browser — the
only external dependency is Plotly, loaded once from cdnjs.

Custom input/output paths still work for one-off runs:

```bash
python src/build_dashboard.py /path/to/new_panel.csv /path/to/dashboard.html
```

## Known data corrections

**Spinouts (fixed Oct 2026, flagged for upstream repair):** the raw
`n_spinouts_surv3` column in `hesa_panel_clean.csv` is systematically 4× the
HE-BCI published figures. The build script applies a `/4` correction before
anything else uses the field, so dashboard numbers match the published
Cambridge/Oxford/UCL totals. When the upstream panel is regenerated from a
clean source, remove the `SPIN_CORRECTION` constant in `build_dashboard.py`.

No local Python? It also runs in **Google Colab** (upload the kit, run the
script, download the HTML) or any Jupyter environment.

## Updating with new data

Drop in a new CSV with the same column names and re-run. The script expects:
`ukprn, he_provider, region_of_he_provider, academic_year, cluster, ay_cpi,
bci_sme, bci_lc, bci_total`, plus the HE-BCI interaction, CPD, contract,
licensing, spinout and HE-funds columns. Extra years are picked up
automatically — all charts, the scorecard baselines, the map year selector
and the CSV exports adapt to whatever years are present.

`ay_cpi` must be indexed so the **latest year = 100**; all real-terms figures
deflate to that base.

## Editing the dashboard

- **Text/layout/colours** → `templates/part1.html` and `part2.html`
  (NCUB palette is defined once in the `:root` CSS variables).
- **Charts, map, scorecard logic, exports** → `templates/part3.html`.
- **Metric definitions** (what counts as an interaction, deflation, etc.)
  → `build_dashboard.py`, section 1.
- The context-tab charts (GDP, OECD comparison, BERD, VC) are hard-coded
  digitisations of the NCUB 2025 figures inside `part3.html`
  (`renderContext()`); replace those arrays when you have the source series.

## Automatic data updates (Economic context tab)

The context charts can refresh themselves from live sources:

```bash
pip install requests
python build_dashboard.py --fetch     # fetch latest data, then build
# or separately:
python fetch_context.py               # writes context_data.json
python build_dashboard.py             # picks it up automatically
```

What updates live:

| Chart | Source | Status |
|---|---|---|
| Monthly GDP + sector contributions | ONS time-series API (MGDP: ECY2, ECY4, ECY9, ECY3) | live |
| UK quarterly GDP growth | ONS time-series API (IHYQ) | live |
| EU / US / Japan quarterly growth | OECD SDMX API | best-effort* |
| Universities in deficit | HESA finance open data (annual) | cached |
| Business R&D (BERD) | ONS BERD release (annual) | cached |
| Venture capital % GDP | OECD (annual) | cached |

*The OECD API query is configured at the top of `fetch_context.py`; if OECD
changes its endpoint, rebuild the URL with https://data-explorer.oecd.org
and paste it in. Every block fails safe: anything unreachable keeps the
cached values and the dashboard still builds.

Sector contributions are approximated as GVA-weight × sector growth, with
services as the residual so the bars always sum to net GDP growth (weights
configurable in `fetch_context.py`). The annual series change once a year —
update them by editing `context_cache.json` when the new releases land.

## Fully hands-free: GitHub Actions

`.github/workflows/update-dashboard.yml` is included. Push the kit to a
GitHub repo, enable Pages (Settings → Pages → Source: GitHub Actions), and
the dashboard rebuilds itself with fresh ONS data on the 16th of every
month (just after the monthly GDP release), on every push, or on demand
via the Actions tab. The published URL serves the latest build —
no manual steps at all.

## Indexing NCUB case studies

When `build_dashboard.py` runs, each case study is matched against the
HESA provider list and annotated with a `ukprns` array — the dashboard
uses this for the institution explorer's Case Studies sub-tab. A multi-
institution case (e.g. Caterpillar + Loughborough + Sussex + Cambridge)
shows up under every featured institution rather than just the first.

Matching pipeline (`match_cases.py`):

1. **Alias table** for common short forms (UCL → University College London,
   QMUL → Queen Mary, etc.). Conservative — only unambiguous aliases.
2. **Exact normalised match** (lowercased, punctuation stripped, "the"
   prefix removed).
3. **Fuzzy stem matching** via `rapidfuzz` (token-set ratio ≥ 88).
4. **Substring containment** as a last resort, only for keys ≥ 10 chars.

After each build, open `case_match_audit.csv` to inspect every case
study's match result. The `needs_review` column flags rows with no match
or low confidence — common reasons:

- Private providers (e.g. Pearson College London) that aren't in the
  HESA HE-BCI panel. These genuinely have no match.
- Names like "Newcastle" or "Birmingham" — ambiguous between several
  HESA providers. To assign them, either edit the case study's
  `university` field in `case_studies.json` to be specific, or extend
  the `ALIASES` table in `match_cases.py` if context makes the mapping
  unambiguous in your data.
- Research institutes hosted by universities (e.g. the Faraday
  Institution at Cambridge). These resolve only if the case body
  mentions the host institution explicitly.

After hand-correcting `case_studies.json` and/or the alias table, re-run
`python build_dashboard.py` and the audit will show your changes.



The "Case studies" tab catalogues NCUB success stories with filterable
intelligence on universities, partners, sectors and themes.

```bash
pip install requests beautifulsoup4
python fetch_case_studies.py            # full crawl (~5-15 min, 0.4s/page)
python fetch_case_studies.py --max 50   # quick test
python fetch_case_studies.py --merge    # add new stories to existing file
python build_dashboard.py               # picks them up automatically
```

The kit ships with a small starter `case_studies.json` of verified examples
so the tab demonstrates immediately. Run the scraper to extend coverage to
the full NCUB success-story corpus.

If your topics chart shows "No topic tags extracted yet" but you already
ran the scraper, you have an older version that looked for explicit tag
elements on the page (NCUB doesn't publish any). Run

```bash
python fetch_case_studies.py --reclassify
```

to re-tag your existing `case_studies.json` using the keyword classifier,
without re-crawling. Takes seconds.

**Honest caveats:** heuristic extraction is not perfect. After running,
open `case_study_review.csv` in Excel — the "needs_review" column flags
rows where the script couldn't identify the university or business partner.
Hand-correct those, then re-run `python build_dashboard.py`. The scraper
respects NCUB's site with a 0.4-second throttle between requests; don't
lower it.

## Mapping partner businesses (Companies House)

The "UK business collaborations" sub-tab in the institution explorer can map
where each provider's business partners are based, using **Companies House**
registered office postcodes.

```bash
pip install rapidfuzz requests           # in addition to pandas
mkdir companies_house
# Download from https://download.companieshouse.gov.uk/en_output.html
# (one ~470MB file or seven parts) and unzip into companies_house/
python enrich_companies.py               # writes company_locations.json
python build_dashboard.py                # picks it up automatically
```

The kit ships with a small starter `company_locations.json` (~20 of the most
cited UK businesses) so the map demonstrates immediately. Run the enrichment
script to extend coverage to all 11,700 business partners.

**Honest caveats:** Companies House lists each company's **registered office**
— legal HQ, not necessarily where research happens. Large firms (AstraZeneca,
GSK) appear at their registered address only; in reality their R&D is spread
across many sites. Name matching is fuzzy; `company_match_log.csv` is your
audit trail. The script skips public bodies, charities and partner names
without a clear corporate match.

The Free Company Data Product is updated monthly. Re-run the script when
new partner data lands or when you refresh Companies House.

## Hosting

The output is a single static file, so any static host works:

- **GitHub Pages**: commit the HTML to a repo, enable Pages — done.
- SharePoint / OneDrive / internal intranet: upload the file.
- A web server: drop it in the document root.

No backend, database or build step is needed at serve time.

## Regenerating the boundaries (optional)

`regions.json` ships pre-built. To rebuild it from source (e.g. higher
detail), download `eer.json` (GB) and the NI outline from
github.com/martinjc/UK-GeoJSON, then simplify with shapely
(`simplify(geom, 0.02)`, drop polygons with area < 0.005, round coords to
3 dp) and write features with a `properties.region` field matching the
region names in the CSV ("Eastern" → "East of England",
"Yorkshire and the Humber" → "Yorkshire and The Humber").
