#!/usr/bin/env python3
"""
enrich_companies.py — match GtR business partners to Companies House and geocode
================================================================================

Pipeline:
 1. Load every unique business name from business_collabs.csv
 2. Match each to a Companies House live company by fuzzy name lookup
 3. Pull the registered office postcode for each matched company
 4. Geocode postcodes via the free postcodes.io API (bulk endpoint, 100/call)
 5. Write company_locations.json which build_dashboard.py picks up automatically

USAGE
-----
First, download the Companies House free data product from
https://download.companieshouse.gov.uk/en_output.html — either the single
~470MB file or the seven multipart files — and unzip into ./companies_house/

Then:
    pip install pandas rapidfuzz requests
    python enrich_companies.py

Outputs:
    company_locations.json   - { "business_name": {lat, lng, postcode, region,
                                                   sic, ch_name, ch_number}, ... }
    company_match_log.csv    - one row per business: matched, score, ch_name
                               (audit trail; lets you correct misses by hand)

RUNTIME
-------
~5 minutes on a laptop: scanning 5.5M Companies House rows takes 2–3 minutes,
geocoding ~5k unique postcodes via postcodes.io takes ~1 minute.

LIMITATIONS (read these)
------------------------
- The CH registered office is the legal HQ, NOT where research happens. For
  large firms (e.g. AstraZeneca registered in Cambridge, R&D sites in dozens
  of locations) the map shows the legal address only.
- Name matching is fuzzy; the audit log lets you spot wrong matches. Confirm
  high-volume names manually if precision matters for your write-up.
- Dissolved companies and partner names without a clear corporate match
  (universities, charities, public bodies) are skipped. They appear in the
  "unmatched" count and you can extend the matcher to handle them.
- Geocoding precision is to the postcode centroid (≈100m in towns, larger in
  rural areas) — fine for a national map, not for street-level work.
"""
import os, sys, json, glob, time, re
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path: sys.path.insert(0, HERE)
os.chdir(ROOT)

# ── folder layout (reorganised Oct 2026) ──────────────────────────────────
# .../CPM_build_kit/{input,output,src}/   —  this file lives in src/
ROOT = os.path.dirname(HERE)
INPUT_DIR  = os.path.join(ROOT, "input")
OUTPUT_DIR = os.path.join(ROOT, "output")
os.makedirs(OUTPUT_DIR, exist_ok=True)

COLLABS = os.path.join(INPUT_DIR, "business_collabs.csv")
CH_DIR = os.path.join(HERE, "companies_house")
OUT_JSON = os.path.join(INPUT_DIR, "company_locations.json")
LOG_CSV = os.path.join(HERE, "company_match_log.csv")
MIN_SCORE = 88     # rapidfuzz token_sort_ratio threshold for a match (out of 100)

def _clean(s):
    """Normalise name for matching: lower, strip suffixes & punctuation."""
    if not isinstance(s, str): return ""
    s = s.lower()
    for w in [" limited", " ltd.", " ltd", " plc.", " plc", " llp",
              " (uk)", " uk", " (gsk)", " corporation", " holdings",
              " group", " international", " ag"]:
        s = s.replace(w, " ")
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s

def load_business_names():
    df = pd.read_csv(COLLABS, encoding="utf-8-sig")
    df = df[df.is_uk_business == "Yes"]
    names = df.business_name_clean.dropna().astype(str)
    names = names[names.str.strip() != ""]
    return sorted(names.unique())

def load_companies_house():
    files = sorted(glob.glob(os.path.join(CH_DIR, "BasicCompany*.csv")))
    if not files:
        sys.exit(f"ERROR: no Companies House CSVs in {CH_DIR}. Download from "
                 f"https://download.companieshouse.gov.uk/en_output.html, "
                 f"unzip into companies_house/ and re-run.")
    use = ["CompanyName", "CompanyNumber", " CompanyStatus",
           "RegAddress.PostCode", "RegAddress.PostTown", "RegAddress.County",
           "SICCode.SicText_1"]
    frames = []
    for fp in files:
        print(f"  reading {os.path.basename(fp)}…")
        h = pd.read_csv(fp, nrows=0).columns.tolist()
        cols = [c for c in use if c in h]
        df = pd.read_csv(fp, usecols=cols, dtype=str, low_memory=False)
        df.columns = [c.strip() for c in df.columns]
        frames.append(df)
    ch = pd.concat(frames, ignore_index=True)
    # keep live companies only — the status column name has spaces in some files
    status_col = next((c for c in ch.columns if c.lower().endswith("status")), None)
    if status_col:
        ch = ch[ch[status_col].fillna("").str.lower().str.contains("active")]
    ch["k"] = ch.CompanyName.apply(_clean)
    ch = ch[ch.k != ""]
    ch = ch.drop_duplicates(subset="k", keep="first")
    print(f"  {len(ch):,} live companies loaded")
    return ch.reset_index(drop=True)

def match_names(names, ch):
    from rapidfuzz import process, fuzz
    choices = ch.k.tolist()
    rows = []
    print(f"  matching {len(names)} business names against {len(choices):,} live companies…")
    for i, nm in enumerate(names):
        if i % 250 == 0: print(f"    {i}/{len(names)}")
        k = _clean(nm)
        if not k: rows.append((nm, None, 0)); continue
        # try exact first (fast path)
        hit = ch[ch.k == k]
        if len(hit):
            rows.append((nm, hit.index[0], 100)); continue
        best = process.extractOne(k, choices, scorer=fuzz.token_sort_ratio, score_cutoff=MIN_SCORE)
        if best:
            _, score, idx = best
            rows.append((nm, idx, int(score)))
        else:
            rows.append((nm, None, 0))
    return rows

def geocode(postcodes):
    """Bulk-geocode via postcodes.io (free, no key, 100/call)."""
    import requests
    out = {}
    chunks = [postcodes[i:i+100] for i in range(0, len(postcodes), 100)]
    print(f"  geocoding {len(postcodes)} postcodes in {len(chunks)} batches…")
    for i, chunk in enumerate(chunks):
        try:
            r = requests.post("https://api.postcodes.io/postcodes",
                              json={"postcodes": chunk}, timeout=30)
            r.raise_for_status()
            for item in r.json().get("result", []):
                p, res = item["query"], item.get("result")
                if res: out[p] = {"lat": res["latitude"], "lng": res["longitude"],
                                  "region": res.get("region"), "ladcode": res.get("admin_district")}
        except Exception as e:
            print(f"    batch {i+1} failed: {e} — continuing")
        time.sleep(0.3)
    return out

def main():
    print("Loading GtR business partners…")
    names = load_business_names()
    print(f"  {len(names)} unique business names")
    print("Loading Companies House snapshot…")
    ch = load_companies_house()
    print("Matching…")
    matches = match_names(names, ch)
    matched = [(nm, idx, sc) for nm, idx, sc in matches if idx is not None]
    print(f"  matched {len(matched)}/{len(names)} ({len(matched)/len(names)*100:.1f}%)")

    # collect postcodes
    pc_col = next((c for c in ch.columns if "PostCode" in c), None)
    pcs = sorted({ch.iloc[idx][pc_col] for _, idx, _ in matched
                  if pd.notna(ch.iloc[idx].get(pc_col))})
    print(f"  {len(pcs)} unique postcodes to geocode")
    coords = geocode(pcs)
    print(f"  geocoded {len(coords)} postcodes")

    # build output
    result = {}
    sic_col = next((c for c in ch.columns if "SicText_1" in c), None)
    for nm, idx, score in matched:
        row = ch.iloc[idx]
        pc = row.get(pc_col)
        coord = coords.get(pc) if pc else None
        if not coord: continue
        result[nm] = {
            "lat": coord["lat"], "lng": coord["lng"],
            "postcode": pc, "region": coord["region"],
            "ladcode": coord["ladcode"],
            "sic": (row.get(sic_col) or "").split(" - ")[-1][:80] if sic_col else None,
            "ch_name": row.CompanyName, "ch_number": row.CompanyNumber,
            "match_score": score}

    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=1)
    pd.DataFrame([(nm, idx is not None, sc,
                   ch.iloc[idx].CompanyName if idx is not None else "")
                  for nm, idx, sc in matches],
                 columns=["business_name", "matched", "score", "ch_name"]
                 ).to_csv(LOG_CSV, index=False)
    print(f"\nWrote {OUT_JSON} ({len(result)} businesses with coordinates)")
    print(f"Wrote {LOG_CSV} (audit trail for all {len(names)} businesses)")
    print(f"\nNow re-run: python build_dashboard.py")

if __name__ == "__main__":
    main()
