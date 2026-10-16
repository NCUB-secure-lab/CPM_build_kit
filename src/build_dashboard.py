#!/usr/bin/env python3
"""
NCUB Collaboration Progress Monitor — dashboard builder
=======================================================
Reads the HESA HE-BCI panel CSV, computes all metrics (constant-price BCI,
interactions, licensing, spinouts, medians, regional aggregates), embeds the
data and UK region boundaries into the HTML templates, and writes a single
self-contained dashboard file.

Folder layout (reorganised Oct 2026):
    CPM_build_kit/
        input/         raw data files + reference CSVs (never written here)
        output/        generated dashboard + audit CSVs (always written here)
        src/           this script and its sibling modules + templates/
        README.md
        .github/

Usage:
    python src/build_dashboard.py [path/to/hesa_panel_clean.csv] [output.html]

Defaults:
    input  = ../input/hesa_panel_clean.csv
    output = ../output/ncub_cpm_dashboard.html

Requirements:  Python 3.9+  and  pandas  (pip install pandas)
"""
import sys, json, os
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))                   # .../src
ROOT = os.path.dirname(HERE)                                        # .../CPM_build_kit
INPUT_DIR  = os.path.join(ROOT, "input")
OUTPUT_DIR = os.path.join(ROOT, "output")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Ensure sibling modules (build_collabs, fetch_context, match_cases) can be
# imported, regardless of how the script is launched (terminal, Spyder,
# Jupyter, double-click). We anchor to src/ for imports and the project root
# for working-directory-relative paths — but all file I/O below uses absolute
# INPUT_DIR / OUTPUT_DIR paths, so working directory is only used for user
# convenience messages.
if HERE not in sys.path:
    sys.path.insert(0, HERE)
os.chdir(ROOT)
args = [a for a in sys.argv[1:] if a != "--fetch"]
FETCH = "--fetch" in sys.argv

# Default input is now the CPM master Excel file (switched Oct 2026). The
# previous hesa_panel_clean.csv is retained in input/ for reference but no
# longer the primary source. Pass a path as the first argument to override.
MASTER_XLSX = os.path.join(INPUT_DIR, "CPM_master.xlsx")
LEGACY_CSV  = os.path.join(INPUT_DIR, "hesa_panel_clean.csv")
CSV_PATH = args[0] if len(args) > 0 else (MASTER_XLSX if os.path.exists(MASTER_XLSX) else LEGACY_CSV)
OUT_PATH = args[1] if len(args) > 1 else os.path.join(OUTPUT_DIR, "ncub_cpm_dashboard.html")

if FETCH:
    import fetch_context
    fetch_context.main()

# ──────────────────────────────────────────────────────────────────────────
# 1. Load and derive metrics
# ──────────────────────────────────────────────────────────────────────────
if CSV_PATH.lower().endswith(".xlsx"):
    df = pd.read_excel(CSV_PATH, sheet_name="cluster_km_k5_analysis_master")
    # The master file uses `kef_cluster` instead of the legacy `cluster` field.
    # Rename so the rest of the code (and the dashboard JS) keep working.
    if "cluster" not in df.columns and "kef_cluster" in df.columns:
        df["cluster"] = df["kef_cluster"]
    print(f"  Loaded CPM master: {len(df):,} rows, {df.ukprn.nunique()} providers")
else:
    df = pd.read_csv(CSV_PATH, encoding="utf-8-sig")
df["cluster"] = df["cluster"].fillna("Unclassified")
num = lambda s: pd.to_numeric(s, errors="coerce").fillna(0)

# interaction counts (consultancy + facilities & equipment + contract research)
df["n_sme"] = num(df.int_n_consult_sme) + num(df.int_n_fe_sme) + num(df.contract_int_n_sme)
df["n_lc"]  = num(df.int_n_consult_lc)  + num(df.int_n_fe_lc)  + num(df.contract_int_n_lc)
df["n_tot"] = (df.n_sme + df.n_lc + num(df.int_n_consult_nc)
               + num(df.int_n_fe_nc) + num(df.contract_int_n_nc))

# licensing — business income only (SME + large business across non-software,
# other IP and software streams; excludes non-commercial *_nc columns)
lic_cols = ["license_inc_nsw_lc_000gbp", "license_inc_nsw_sme_000gbp",
            "license_inc_ip_lc_000gbp",  "license_inc_ip_sme_000gbp",
            "license_inc_sw_lc_000gbp",  "license_inc_sw_sme_000gbp"]
df["lic_inc"] = df[lic_cols].apply(num).sum(axis=1)
# breakdown of business licensing income by stream × business size, real terms
df["lic_nsw_sme"] = num(df.license_inc_nsw_sme_000gbp) / df.ay_cpi * 100
df["lic_nsw_lc"]  = num(df.license_inc_nsw_lc_000gbp)  / df.ay_cpi * 100
df["lic_ip_sme"]  = num(df.license_inc_ip_sme_000gbp)  / df.ay_cpi * 100
df["lic_ip_lc"]   = num(df.license_inc_ip_lc_000gbp)   / df.ay_cpi * 100
df["lic_sw_sme"]  = num(df.license_inc_sw_sme_000gbp)  / df.ay_cpi * 100
df["lic_sw_lc"]   = num(df.license_inc_sw_lc_000gbp)   / df.ay_cpi * 100
# licence count breakdown (business clients)
df["lic_n_nsw_sme"] = num(df.nonsoftware_sme)
df["lic_n_nsw_lc"]  = num(df.nonsoftware_lc)
df["lic_n_sw_sme"]  = num(df.software_sme)
df["lic_n_sw_lc"]   = num(df.software_lc)
# IP pipeline
df["disclosures"]  = num(df.n_disclosures)
df["pat_filed"]    = num(df.n_patents_filed)
df["pat_ext"]      = num(df.n_external_patents)
df["lic_n"] = (num(df.nonsoftware_sme) + num(df.nonsoftware_lc)
               + num(df.software_sme) + num(df.software_lc))
# licences-granted aggregates by business size — feeds Total/SME/Large selector
df["lic_n_sme"] = num(df.nonsoftware_sme) + num(df.software_sme)
df["lic_n_lc"]  = num(df.nonsoftware_lc)  + num(df.software_lc)

# constant 2024/25 prices (£000): nominal / CPI * 100  (ay_cpi: 2024/25 = 100)
defl = lambda col: num(df[col]) / df.ay_cpi * 100
df["real"]     = defl("bci_total")
df["real_sme"] = defl("bci_sme")
df["real_lc"]  = defl("bci_lc")
# income streams, business clients only (SME + large; excludes non-commercial)
df["contract_v"] = (num(df.contract_int_v_sme_000gbp) + num(df.contract_int_v_lc_000gbp)) / df.ay_cpi * 100
df["consult_v"]  = (num(df.int_v_consult_sme_000gbp)  + num(df.int_v_consult_lc_000gbp))  / df.ay_cpi * 100
df["fe_v"]       = (num(df.int_v_fe_sme_000gbp)       + num(df.int_v_fe_lc_000gbp))       / df.ay_cpi * 100
# split by business size — feeds the Total/SME/Large selector on the CAGR tab
df["contract_v_sme"] = num(df.contract_int_v_sme_000gbp) / df.ay_cpi * 100
df["contract_v_lc"]  = num(df.contract_int_v_lc_000gbp)  / df.ay_cpi * 100
df["consult_v_sme"]  = num(df.int_v_consult_sme_000gbp) / df.ay_cpi * 100
df["consult_v_lc"]   = num(df.int_v_consult_lc_000gbp)  / df.ay_cpi * 100
df["fe_v_sme"]       = num(df.int_v_fe_sme_000gbp) / df.ay_cpi * 100
df["fe_v_lc"]        = num(df.int_v_fe_lc_000gbp)  / df.ay_cpi * 100
df["lic_real_sme"]   = (num(df.license_inc_nsw_sme_000gbp) + num(df.license_inc_ip_sme_000gbp) + num(df.license_inc_sw_sme_000gbp)) / df.ay_cpi * 100
df["lic_real_lc"]    = (num(df.license_inc_nsw_lc_000gbp)  + num(df.license_inc_ip_lc_000gbp)  + num(df.license_inc_sw_lc_000gbp))  / df.ay_cpi * 100
df["lic_real"] = df.lic_inc / df.ay_cpi * 100
df["uk_ind"]   = defl("hefunds_uk_industry")
df["hef_tot"]  = defl("hefunds_total")
# ── Spin-outs (CPM definition) ────────────────────────────────────────────
# `n_spinouts_surv3` in the master equals the CPM-defined spinout count:
#   Spin-outs with some HE provider ownership + Other spin-outs
# (survived at least 3 years). Verified Oct 2026 against table-4e per
# provider — exact match for Cambridge (234), Oxford (208), UCL (101), etc.
# No correction factor needed when reading from CPM_master.xlsx. The old
# hesa_panel_clean.csv had a 4x bug; see /input/hesa_panel_clean.csv notes.
df["spin"] = num(df.n_spinouts_surv3)

# ── Staff and student start-ups (NEW, from table-4e) ─────────────────────
# Loaded as separate metrics per the CPM report convention: the headline
# "spin-outs" measure only counts Spin-outs with HE ownership + Other
# spin-outs; Staff start-ups and Student start-ups (what some call
# "graduate start-ups") are reported alongside but kept distinct.
t4e_path = os.path.join(INPUT_DIR, "table-4e.csv")
if os.path.exists(t4e_path):
    t4e = pd.read_csv(t4e_path, skiprows=10, encoding="utf-8-sig")
    t4e["Value"] = pd.to_numeric(t4e["Value"], errors="coerce").fillna(0)
    # Each row group appears 4x in the HESA export — dedup on the full key.
    t4e = t4e.drop_duplicates(subset=["UKPRN","Academic Year","Metric","Category Marker","Value"])

    # Helper: pivot a given metric slice to (ukprn, year, categories…) columns
    def _pivot_metric(metric_label):
        sub = t4e[t4e["Metric"] == metric_label]
        if sub.empty: return None
        p = sub.pivot_table(index=["UKPRN","Academic Year"], columns="Category Marker",
                            values="Value", aggfunc="sum").reset_index().fillna(0)
        p.columns.name = None
        return p.rename(columns={"UKPRN":"ukprn", "Academic Year":"academic_year"})

    # 1) Firm counts (surv 3+ yrs) by category — our CPM spin + start-ups split
    counts = _pivot_metric("Number still active which have survived at least 3 years")
    counts = counts.rename(columns={
        "Staff start-ups":"staff_startup",
        "Student start-ups":"student_startup",
        "Social enterprises":"social_enterprise"})
    for c in ["staff_startup","student_startup","social_enterprise"]:
        if c not in counts.columns: counts[c] = 0
    df = df.merge(counts[["ukprn","academic_year","staff_startup","student_startup","social_enterprise"]],
                  on=["ukprn","academic_year"], how="left")
    for c in ["staff_startup","student_startup","social_enterprise"]:
        df[c] = df[c].fillna(0)

    # 2) Employment (FTE) — sum across CPM spin-out categories per provider
    fte = _pivot_metric("Estimated current employment of all active firms (FTE)")
    if fte is not None:
        cpm_cats = ["Spin-outs with some HE provider ownership", "Other spin-outs"]
        for c in cpm_cats + ["Staff start-ups","Student start-ups","Social enterprises"]:
            if c not in fte.columns: fte[c] = 0
        fte["spin_fte"]    = fte[cpm_cats].sum(axis=1)
        fte["staff_fte"]   = fte["Staff start-ups"]
        fte["student_fte"] = fte["Student start-ups"]
        df = df.merge(fte[["ukprn","academic_year","spin_fte","staff_fte","student_fte"]],
                      on=["ukprn","academic_year"], how="left")
        for c in ["spin_fte","staff_fte","student_fte"]:
            df[c] = df[c].fillna(0)

    # 3) Turnover (£k) — sum across CPM spin-out categories
    tov = _pivot_metric("Estimated current turnover of all active firms (£ thousands)")
    if tov is not None:
        cpm_cats = ["Spin-outs with some HE provider ownership", "Other spin-outs"]
        for c in cpm_cats:
            if c not in tov.columns: tov[c] = 0
        tov["spin_turnover"] = tov[cpm_cats].sum(axis=1)
        df = df.merge(tov[["ukprn","academic_year","spin_turnover"]],
                      on=["ukprn","academic_year"], how="left")
        df["spin_turnover"] = df["spin_turnover"].fillna(0)

    print(f"  Loaded table-4e: start-up categories + FTE/turnover merged for {counts.ukprn.nunique()} providers")
else:
    print(f"  WARNING: {t4e_path} not found — staff/student start-ups and FTE will not be available")
    for c in ["staff_startup","student_startup","social_enterprise","spin_fte","staff_fte","student_fte","spin_turnover"]:
        df[c] = 0
# estimated external investment in active spinouts (£000), real terms.
df["ext_real"] = num(df.external_investment_spin) / df.ay_cpi * 100
# one anomalous return (>£20bn from a single provider-year) excluded from
# national totals but kept in provider-level views and exports
ANOM = 2.0e7
df["ext_capped"] = df.ext_real.where(df.ext_real <= ANOM, 0)
# nominal (cash, as reported) — same anomaly mask as the real series so the
# real/nominal toggle in the dashboard compares like with like
df["ext_nom"] = num(df.external_investment_spin)
df["ext_nom_capped"] = df.ext_nom.where(df.ext_real <= ANOM, 0)
df["pat"]  = num(df.n_patents_granted)
df["disc"] = num(df.n_disclosures)

years = sorted(df.academic_year.unique())
r1 = lambda x: round(float(x), 1)
opt = lambda v, f=r1: None if pd.isna(v) else f(v)

# ── TRAC peer-group classification (optional reference file) ──
# Mapping ukprn → {group, label}. Loads trac_groups.csv if present;
# providers without a tag get no TRAC chip in the explorer.
trac_lookup = {}
trac_path = os.path.join(INPUT_DIR, "trac_groups.csv")
if os.path.exists(trac_path):
    with open(trac_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or line.startswith("ukprn,"):
                continue
            parts = [p.strip() for p in line.split(",")]
            if len(parts) >= 3 and parts[0]:
                trac_lookup[parts[0]] = {"group": parts[1], "label": parts[2]}
    print(f"  TRAC groups: {len(trac_lookup)} providers tagged")

# ── per-institution records ───────────────────────────────────────────────
unis = {}
for (ukprn, name), g in df.groupby(["ukprn", "he_provider"]):
    g = g.set_index("academic_year").reindex(years)
    # safely pull optional classification fields from the master
    def _first(colname, fallback=None):
        if colname not in g.columns: return fallback
        s = g[colname].dropna()
        return s.iloc[0] if len(s) else fallback
    unis[str(ukprn)] = {
        "name": name,
        "region": g.region_of_he_provider.dropna().iloc[0],
        "country": _first("country_of_he_provider"),
        "cluster": g.cluster.dropna().iloc[0],
        "growth_group": _first("group_km_k5_name"),
        "trac": trac_lookup.get(str(ukprn)),
        "real":     [opt(v) for v in g.real],
        "real_sme": [opt(v) for v in g.real_sme],
        "real_lc":  [opt(v) for v in g.real_lc],
        "n_sme":    [opt(v, int) for v in g.n_sme],
        "n_lc":     [opt(v, int) for v in g.n_lc],
        "contract": [opt(v) for v in g.contract_v],
        "consult":  [opt(v) for v in g.consult_v],
        "fe":       [opt(v) for v in g.fe_v],
        "lic":      [opt(v) for v in g.lic_real],
        # SME/LC splits per stream (feeds the Total/SME/Large selector)
        "contract_sme": [opt(v) for v in g.contract_v_sme],
        "contract_lc":  [opt(v) for v in g.contract_v_lc],
        "consult_sme":  [opt(v) for v in g.consult_v_sme],
        "consult_lc":   [opt(v) for v in g.consult_v_lc],
        "fe_sme":       [opt(v) for v in g.fe_v_sme],
        "fe_lc":        [opt(v) for v in g.fe_v_lc],
        "lic_sme":      [opt(v) for v in g.lic_real_sme],
        "lic_lc":       [opt(v) for v in g.lic_real_lc],
        "lic_n":    [opt(v, int) for v in g.lic_n],
        "lic_n_sme": [opt(v, int) for v in g.lic_n_sme],
        "lic_n_lc":  [opt(v, int) for v in g.lic_n_lc],
        "spin":     [opt(v, int) for v in g.spin],
        # Staff/student start-ups: new separate metrics from table-4e (CPM
        # convention keeps these distinct from the headline spinout measure)
        "staff_startup":   [opt(v, int) for v in g.get("staff_startup",   pd.Series([0]*len(g)))],
        "student_startup": [opt(v, int) for v in g.get("student_startup", pd.Series([0]*len(g)))],
        "social_enterprise": [opt(v, int) for v in g.get("social_enterprise", pd.Series([0]*len(g)))],
        # FTE employment and turnover across CPM spin-outs (from table-4e)
        "spin_fte":        [opt(v, int) for v in g.get("spin_fte",      pd.Series([0]*len(g)))],
        "staff_fte":       [opt(v, int) for v in g.get("staff_fte",     pd.Series([0]*len(g)))],
        "student_fte":     [opt(v, int) for v in g.get("student_fte",   pd.Series([0]*len(g)))],
        "spin_turnover":   [opt(v, int) for v in g.get("spin_turnover", pd.Series([0]*len(g)))],
        "ext":      [opt(v) for v in g.ext_real],
        "ext_nom":  [opt(v) for v in g.ext_nom],
        "pat":      [opt(v, int) for v in g.pat],
        "uk_ind":   [opt(v) for v in g.uk_ind],
        # licensing income breakdown (real £000)
        "lic_nsw_sme": [opt(v) for v in g.lic_nsw_sme],
        "lic_nsw_lc":  [opt(v) for v in g.lic_nsw_lc],
        "lic_ip_sme":  [opt(v) for v in g.lic_ip_sme],
        "lic_ip_lc":   [opt(v) for v in g.lic_ip_lc],
        "lic_sw_sme":  [opt(v) for v in g.lic_sw_sme],
        "lic_sw_lc":   [opt(v) for v in g.lic_sw_lc],
        # licence counts
        "lic_n_nsw_sme": [opt(v, int) for v in g.lic_n_nsw_sme],
        "lic_n_nsw_lc":  [opt(v, int) for v in g.lic_n_nsw_lc],
        "lic_n_sw_sme":  [opt(v, int) for v in g.lic_n_sw_sme],
        "lic_n_sw_lc":   [opt(v, int) for v in g.lic_n_sw_lc],
        # IP pipeline
        "disclosures": [opt(v, int) for v in g.disclosures],
        "pat_filed":   [opt(v, int) for v in g.pat_filed],
        "pat_ext":     [opt(v, int) for v in g.pat_ext],
    }

# ── national aggregates ───────────────────────────────────────────────────
agg = df.groupby("academic_year").agg(
    real=("real", "sum"), real_sme=("real_sme", "sum"), real_lc=("real_lc", "sum"),
    n_sme=("n_sme", "sum"), n_lc=("n_lc", "sum"), n_tot=("n_tot", "sum"),
    contract=("contract_v", "sum"), consult=("consult_v", "sum"), fe=("fe_v", "sum"),
    lic=("lic_real", "sum"), lic_n=("lic_n", "sum"), spin=("spin", "sum"),
    staff_startup=("staff_startup", "sum"), student_startup=("student_startup", "sum"),
    social_enterprise=("social_enterprise", "sum"),
    pat=("pat", "sum"), disc=("disc", "sum"), uk_ind=("uk_ind", "sum"),
    hef=("hef_tot", "sum"), n_unis=("he_provider", "count"),
    ext=("ext_capped", "sum"), ext_nom=("ext_nom_capped", "sum"), ext_n_anom=("ext_real", lambda x: int((x > 2.0e7).sum()))
    ).reindex(years)
national = {k: [r1(v) for v in agg[k]] for k in agg.columns}
# median external investment across providers reporting > 0 (real £000)
ext_med = df[df.ext_real > 0].groupby("academic_year").ext_real.median().reindex(years)
national["ext_med"] = [opt(v) or 0 for v in ext_med]
ext_med_nom = df[df.ext_nom > 0].groupby("academic_year").ext_nom.median().reindex(years)
national["ext_med_nom"] = [opt(v) or 0 for v in ext_med_nom]
# median spinout FTE employment across providers reporting > 0 (headcount FTE)
if "spin_fte" in df.columns:
    fte_med = df[df.spin_fte > 0].groupby("academic_year").spin_fte.median().reindex(years)
    national["fte_med"] = [int(v) if pd.notna(v) else 0 for v in fte_med]
    national["spin_fte_total"] = [int(v) for v in df.groupby("academic_year").spin_fte.sum().reindex(years).fillna(0)]
    national["staff_fte_total"] = [int(v) for v in df.groupby("academic_year").staff_fte.sum().reindex(years).fillna(0)]
    national["student_fte_total"] = [int(v) for v in df.groupby("academic_year").student_fte.sum().reindex(years).fillna(0)]
else:
    national["fte_med"] = [0]*len(years)

# ── medians (cluster / region / national) ────────────────────────────────
def med_table(group_col):
    out = {}
    for gname, g in df.groupby(group_col):
        s = g.groupby("academic_year").real.median().reindex(years)
        out[gname] = [opt(v) for v in s]
    return out
cluster_med = med_table("cluster")
region_med = med_table("region_of_he_provider")
nat_med = [r1(v) for v in df.groupby("academic_year").real.median().reindex(years)]

# ── per-cluster aggregates of total BCI and its four streams ──────────────
# Feeds the headline-findings decomposition chart.
cluster_agg = {}
for cname, g in df.groupby("cluster"):
    a = g.groupby("academic_year").agg(
        real=("real", "sum"),
        contract=("contract_v", "sum"),
        consult=("consult_v", "sum"),
        fe=("fe_v", "sum"),
        lic=("lic_real", "sum"),
        n=("he_provider", "count")).reindex(years).fillna(0)
    cluster_agg[cname] = {k: [r1(v) for v in a[k]] for k in ["real","contract","consult","fe","lic"]}
    cluster_agg[cname]["n_providers"] = int(a.n.max())

# ── latest-year growth per provider (funnel + regional box) ──────────────
growth = {}
for k, rec in unis.items():
    a, b = rec["real"][-2], rec["real"][-1]
    if a and b and a > 200:                       # exclude tiny denominators
        growth[k] = round((b / a - 1) * 100, 1)

# ── regional aggregates (choropleth) ─────────────────────────────────────
regionAgg = {}
for r, g in df.groupby("region_of_he_provider"):
    a = g.groupby("academic_year").agg(
        real=("real", "sum"), n_sme=("n_sme", "sum"), n_lc=("n_lc", "sum"),
        lic=("lic_real", "sum"), spin=("spin", "sum"),
        n=("he_provider", "count")).reindex(years).fillna(0)
    med = g.groupby("academic_year").real.median().reindex(years)
    regionAgg[r] = {
        "real": [r1(v) for v in a.real], "n_sme": [int(v) for v in a.n_sme],
        "n_lc": [int(v) for v in a.n_lc], "lic": [r1(v) for v in a.lic],
        "spin": [int(v) for v in a.spin], "n": [int(v) for v in a.n],
        "med": [opt(v) for v in med]}

# ── geo boundaries (pre-simplified ONS regions, shipped with this kit) ───
with open(os.path.join(INPUT_DIR, "regions.json"), encoding="utf-8") as f:
    geo = json.load(f)

# ── Business collaborations from Gateway to Research (per-provider) ─────
from build_collabs import build_collabs
collabs = build_collabs(os.path.join(INPUT_DIR, "business_collabs.csv"), df)
print(f"  Business collabs: {collabs['national']['total_links']:,} UK-business links, "
      f"{collabs['matched_share']}% matched to {collabs['matched_providers']} providers")

# ── Companies House → postcode-level locations for each partner business ──
loc_path = os.path.join(INPUT_DIR, "company_locations.json")
if os.path.exists(loc_path):
    with open(loc_path, encoding="utf-8") as f:
        company_locations = json.load(f)
    company_locations.pop("_note", None)
    # attach a per-provider partner-location summary
    full_df = pd.read_csv(os.path.join(INPUT_DIR, "business_collabs.csv"), encoding="utf-8-sig")
    full_df = full_df[full_df.is_uk_business == "Yes"].copy()
    full_df["business"] = full_df.business_name_clean.fillna("").astype(str).str.strip()
    # match leads to ukprn the same way as build_collabs (re-import _key)
    from build_collabs import _key
    hesa_map = {_key(n): str(u) for n, u in zip(df.he_provider, df.ukprn) if _key(n)}
    def m(name):
        k = _key(name)
        if not k: return None
        if k in hesa_map: return hesa_map[k]
        if len(k) < 8: return None
        for hk, v in hesa_map.items():
            if len(hk) >= 8 and (hk in k or k in hk): return v
        return None
    full_df["ukprn"] = full_df.lead_org_name.apply(m)
    matched = full_df[full_df.ukprn.notna()].copy()
    partner_locs = {}
    for ukprn, g in matched.groupby("ukprn"):
        counts = g.business[g.business != ""].value_counts()
        pts = []
        for bname, n in counts.items():
            loc = company_locations.get(bname)
            if loc:
                pts.append({"name": bname, "n": int(n),
                            "lat": loc["lat"], "lng": loc["lng"],
                            "region": loc.get("region"), "postcode": loc.get("postcode")})
        if pts: partner_locs[str(ukprn)] = pts
    geocoded_share = round(sum(p["n"] for ps in partner_locs.values() for p in ps) / max(1, len(matched)) * 100, 1)
    print(f"  Partner geography: {len(company_locations)} businesses geocoded → "
          f"{geocoded_share}% of matched collaborations placed on the map")
else:
    company_locations, partner_locs, geocoded_share = {}, {}, 0
    print("  Partner geography: no company_locations.json — run enrich_companies.py "
          "to enable the partner map")

# ── R&D collaboration (GtR / pillar 4) indicators and trends ────────────
gtr_ind = pd.read_csv(os.path.join(INPUT_DIR, "ri_indicators.csv"), encoding="utf-8-sig").fillna("")
gtr_tr = pd.read_csv(os.path.join(INPUT_DIR, "ri_trends_full.csv"), encoding="utf-8-sig")
gtr = {"indicators": gtr_ind.to_dict("records"),
       "trends": {c: [None if pd.isna(v) else (int(v) if c in ("year","V1","V2","V3","I5a","I6a","C4d") else round(float(v),2))
                      for v in gtr_tr[c]] for c in gtr_tr.columns}}

# ── economic context: live-fetched file if present, else bundled cache ──
ctx_file = os.path.join(INPUT_DIR, "context_data.json")
if not os.path.exists(ctx_file):
    ctx_file = os.path.join(INPUT_DIR, "context_cache.json")
with open(ctx_file, encoding="utf-8") as f:
    ctx = json.load(f)
print(f"  Context data: {os.path.basename(ctx_file)} "
      f"(updated: {ctx.get('meta',{}).get('updated','n/a')})")

# ── NCUB case studies (run fetch_case_studies.py for the full corpus) ──
cases_path = os.path.join(INPUT_DIR, "case_studies.json")
cases = []
if os.path.exists(cases_path):
    with open(cases_path, encoding="utf-8") as f:
        cases = [c for c in json.load(f) if c.get("url") != "_note"]
    # enrich each case with ukprns/uni_names lists via fuzzy matching
    from match_cases import enrich_cases
    audit_path = os.path.join(OUTPUT_DIR, "case_match_audit.csv")
    stats = enrich_cases(cases, df, audit_path=audit_path)
    # attach region(s) so the dashboard can show geographic concentration
    ukprn_region = dict(zip(df.ukprn.astype(str), df.region_of_he_provider))
    for c in cases:
        regs = sorted({ukprn_region[u] for u in c.get("ukprns", []) if u in ukprn_region})
        c["regions"] = regs
    print(f"  Case studies: {stats['n_total']} loaded · {stats['n_matched_any']} matched "
          f"to ≥1 provider · {stats['n_matched_multi']} multi-university stories")
    print(f"  Match audit: {os.path.basename(audit_path)} (open in Excel to review "
          f"'needs_review' rows)")
else:
    print(f"  Case studies: none loaded (no {os.path.basename(cases_path)})")

data = {"years": years, "unis": unis, "national": national,
        "clusterMed": cluster_med, "regionMed": region_med, "natMed": nat_med,
        "clusterAgg": cluster_agg,
        "growth": growth, "regionAgg": regionAgg, "geo": geo, "ctx": ctx,
        "gtr": gtr, "collabs": collabs,
        "partnerLocs": partner_locs, "geocodedShare": geocoded_share,
        "cases": cases}

# ──────────────────────────────────────────────────────────────────────────
# 2. Assemble the HTML
# ──────────────────────────────────────────────────────────────────────────
tpl = ""
for part in ("part1.html", "part2.html", "part3.html"):
    with open(os.path.join(HERE, "templates", part), encoding="utf-8") as f:
        tpl += f.read()

html = tpl.replace("__DATA__", json.dumps(data, separators=(",", ":")))
with open(OUT_PATH, "w", encoding="utf-8") as f:
    f.write(html)

# Always also write an `index.html` copy next to the main output. index.html
# is what web hosts (GitHub Pages, Netlify, S3) serve by default when no file
# is specified, so this makes the output directly deployable without any
# extra renaming step. The two files are identical; publish either.
INDEX_PATH = os.path.join(os.path.dirname(OUT_PATH), "index.html")
if os.path.abspath(INDEX_PATH) != os.path.abspath(OUT_PATH):
    with open(INDEX_PATH, "w", encoding="utf-8") as f:
        f.write(html)

print(f"[OK] Dashboard written to {OUT_PATH}")
if os.path.abspath(INDEX_PATH) != os.path.abspath(OUT_PATH):
    print(f"     and duplicated as {INDEX_PATH} (for web hosts that serve index.html)")
print(f"  Providers: {len(unis)} | Years: {years[0]}–{years[-1]} | "
      f"Size: {os.path.getsize(OUT_PATH)/1e6:.2f} MB")
print("  Open it in any browser (internet needed once, to load Plotly from CDN).")

# ──────────────────────────────────────────────────────────────────────────
# 7. Enriched provider master export
# ──────────────────────────────────────────────────────────────────────────
# One XLSX, three sheets:
#   • annual_panel   — long format, one row per (provider, year), every metric
#   • provider_profile — one row per provider, latest-year snapshot + static
#                        enrichment (TRAC group, HE-BCI cluster, growth group,
#                        case-study count, business-partner count, geocoded
#                        partner count, 5-year CAGRs)
#   • readme         — column dictionary
try:
    master_out = os.path.join(OUTPUT_DIR, "universities_master_enriched.xlsx")
    yi_last = len(years) - 1

    # Case-study count per provider (ukprns was attached in match_cases)
    cs_count = {}
    for c in cases:
        for u in (c.get("ukprns") or []):
            cs_count[u] = cs_count.get(u, 0) + 1

    # Business collaboration counts per provider (from the collabs module)
    bc_by_prov = (collabs.get("per_provider") or {}) if isinstance(collabs, dict) else {}
    # bc_by_prov is keyed by ukprn string → {n_collabs, value_gbp, matched_pct, ...}

    # 5-year CAGRs for key metrics (same formula as the Growth analysis tab)
    def _cagr5(arr, floor=100):
        if len(arr) < 6: return None
        a, b = arr[-6], arr[-1]
        if a is None or b is None or a < floor or b < 0: return None
        return round((pow(b/a, 1/5) - 1) * 100, 1)

    # Sheet 1 — annual panel (long)
    panel_rows = []
    for ukprn, u in unis.items():
        for i, y in enumerate(years):
            panel_rows.append({
                "ukprn": ukprn, "he_provider": u["name"],
                "region": u["region"], "country": u.get("country"),
                "hebci_cluster": u["cluster"],
                "trac_group": (u.get("trac") or {}).get("group"),
                "trac_label": (u.get("trac") or {}).get("label"),
                "growth_group_k5": u.get("growth_group"),
                "academic_year": y,
                # BCI
                "bci_total_real_gbp000":        u["real"][i],
                "bci_sme_real_gbp000":          u["real_sme"][i],
                "bci_large_real_gbp000":        u["real_lc"][i],
                "n_interactions_sme":           u["n_sme"][i],
                "n_interactions_large":         u["n_lc"][i],
                # Income streams (business clients only)
                "consultancy_real_gbp000":      u["consult"][i],
                "fe_equipment_real_gbp000":     u["fe"][i],
                "contract_research_real_gbp000":u["contract"][i],
                "licensing_total_real_gbp000":  u["lic"][i],
                "licensing_sme_real_gbp000":    u.get("lic_sme",      [None]*len(years))[i],
                "licensing_large_real_gbp000":  u.get("lic_lc",       [None]*len(years))[i],
                "licensing_sme_count":          u.get("lic_n_sme",    [None]*len(years))[i],
                "licensing_large_count":        u.get("lic_n_lc",     [None]*len(years))[i],
                "licensing_total_count":        u["lic_n"][i],
                # Commercialisation
                "spinouts_cpm":                 u["spin"][i],
                "spin_fte":                     u.get("spin_fte",     [None]*len(years))[i],
                "spin_turnover_gbp000":         u.get("spin_turnover",[None]*len(years))[i],
                "staff_startups":               u.get("staff_startup",[None]*len(years))[i],
                "student_startups":             u.get("student_startup",[None]*len(years))[i],
                "social_enterprises":           u.get("social_enterprise",[None]*len(years))[i],
                "external_investment_real_gbp000": u["ext"][i],
                "external_investment_nominal_gbp000": u.get("ext_nom",[None]*len(years))[i],
                # IP pipeline
                "ip_disclosures":               u.get("disclosures",  [None]*len(years))[i],
                "patents_granted":              u["pat"][i],
            })
    panel_df = pd.DataFrame(panel_rows)

    # Sheet 2 — provider profile (one row per provider)
    profile_rows = []
    for ukprn, u in unis.items():
        row = {
            "ukprn": ukprn, "he_provider": u["name"],
            "region": u["region"], "country": u.get("country"),
            "hebci_cluster": u["cluster"],
            "trac_group": (u.get("trac") or {}).get("group"),
            "trac_label": (u.get("trac") or {}).get("label"),
            "growth_group_k5": u.get("growth_group"),
            "years_with_data": sum(1 for v in u["real"] if v is not None),
            # Latest-year snapshot
            f"bci_total_{years[yi_last].replace('/','_')}_real_gbp000": u["real"][yi_last],
            f"spinouts_cpm_{years[yi_last].replace('/','_')}":          u["spin"][yi_last],
            f"spin_fte_{years[yi_last].replace('/','_')}":              u.get("spin_fte",[None]*len(years))[yi_last],
            f"staff_startups_{years[yi_last].replace('/','_')}":        u.get("staff_startup",[None]*len(years))[yi_last],
            f"student_startups_{years[yi_last].replace('/','_')}":      u.get("student_startup",[None]*len(years))[yi_last],
            # 5-year CAGRs
            "cagr5_bci":                _cagr5(u["real"]),
            "cagr5_contract":           _cagr5(u["contract"]),
            "cagr5_consultancy":        _cagr5(u["consult"]),
            "cagr5_licensing":          _cagr5(u["lic"]),
            "cagr5_spinouts":           _cagr5(u["spin"], floor=1),
            # Enrichment counts
            "ncub_case_studies_featuring":  cs_count.get(ukprn, 0),
            "n_business_collaborations":    (bc_by_prov.get(ukprn, {}) or {}).get("total_links", 0),
            "unique_business_partners":     (bc_by_prov.get(ukprn, {}) or {}).get("unique_businesses", 0),
            "unique_gtr_projects":          (bc_by_prov.get(ukprn, {}) or {}).get("unique_projects", 0),
            "business_collab_grant_value_gbp": (bc_by_prov.get(ukprn, {}) or {}).get("total_grant_value", 0),
        }
        profile_rows.append(row)
    profile_df = pd.DataFrame(profile_rows)

    # Sheet 3 — readme
    readme_rows = [
        ["Sheet", "Description"],
        ["annual_panel",     "One row per (provider, year). All metrics in constant 2024/25 prices unless noted."],
        ["provider_profile", "One row per provider. Latest-year snapshot + 5-year CAGRs + enrichment counts."],
        ["readme",           "This sheet."],
        ["", ""],
        ["Column suffix / prefix", "Meaning"],
        ["*_real_gbp000", "Real £000s, deflated using HESA CPI (2024/25 = 100)."],
        ["*_count",       "Count of discrete items (licences, firms…)."],
        ["cagr5_*",       "Five-year compound annual growth rate (%), latest year vs year t-5."],
        ["", ""],
        ["Spin-out definitions (CPM report convention)", ""],
        ["spinouts_cpm",       "HESA table-4e: 'Spin-outs with some HE provider ownership' + 'Other spin-outs', surviving 3+ years."],
        ["staff_startups",     "HESA table-4e: 'Staff start-ups', surviving 3+ years. Separate category."],
        ["student_startups",   "HESA table-4e: 'Student start-ups', surviving 3+ years. Separate category."],
        ["social_enterprises", "HESA table-4e: 'Social enterprises', surviving 3+ years. Separate category."],
        ["spin_fte",           "FTE employment across CPM spin-outs (ownership + other)."],
        ["spin_turnover_gbp000","Estimated current turnover across CPM spin-outs, £000s nominal (table-4e)."],
        ["external_investment_real_gbp000", "Capital raised by active spin-outs, real £000s."],
        ["", ""],
        ["Classification fields", ""],
        ["hebci_cluster",   "Research England HE-BCI peer cluster (same used in dashboard filters)."],
        ["trac_group",      "OfS TRAC peer group letter (A–F); blank for providers outside OfS TRAC framework."],
        ["trac_label",      "'Group A' through 'Group F' per OfS Annex 4.1b 2023-24. See trac_groups.csv."],
        ["growth_group_k5", "K-means k=5 BCI trajectory classification from CPM_master."],
        ["", ""],
        ["Source",         f"Built {pd.Timestamp.now().strftime('%Y-%m-%d %H:%M')} from CPM_master.xlsx + table-4e.csv + NCUB case-studies + GtR business collabs."],
    ]
    readme_df = pd.DataFrame(readme_rows[1:], columns=readme_rows[0])

    with pd.ExcelWriter(master_out, engine="openpyxl") as xl:
        panel_df.to_excel(xl, sheet_name="annual_panel", index=False)
        profile_df.to_excel(xl, sheet_name="provider_profile", index=False)
        readme_df.to_excel(xl, sheet_name="readme", index=False)
    print(f"[OK] Universities master written to {master_out}")
    print(f"  {len(panel_df):,} annual rows | {len(profile_df)} providers | "
          f"{len(panel_df.columns)} metrics")
except Exception as e:
    print(f"  WARNING: universities master export failed: {e}")
