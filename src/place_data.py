"""
place_data.py — geography layer for the NCUB Collaboration Progress Monitor.

Reads input/master_panel.xlsx (university x year panel with campus ITL2, TTWA and
local-economy typology) and returns
  * a compact provider-level JSON structure embedded in the dashboard (D.place), and
  * pandas helpers used by build_place_reports.py to write the PowerPoint reports.

All £ values in master_panel.xlsx are real 2024/25 prices, £000.
Place caveat (from the panel README): income is recorded where the university is
based (main-campus TTWA). It does not show where partners are located.
"""
import os
import numpy as np
import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
INPUT_DIR = os.path.join(ROOT, "input")
PANEL_PATH = os.path.join(INPUT_DIR, "master_panel.xlsx")

ITL1_NAMES = {
    "TLC": "North East", "TLD": "North West", "TLE": "Yorkshire and The Humber",
    "TLF": "East Midlands", "TLG": "West Midlands", "TLH": "East of England",
    "TLI": "London", "TLJ": "South East", "TLK": "South West", "TLL": "Wales",
    "TLM": "Scotland", "TLN": "Northern Ireland",
}
ITL2_NAMES = {
    "TLC3": "Tees Valley", "TLC4": "Northumberland, Durham and Tyne & Wear",
    "TLD1": "Cumbria", "TLD3": "Greater Manchester", "TLD4": "Lancashire",
    "TLD6": "Cheshire", "TLD7": "Merseyside",
    "TLE1": "East Yorkshire and Northern Lincolnshire", "TLE2": "North Yorkshire",
    "TLE3": "South Yorkshire", "TLE4": "West Yorkshire",
    "TLF1": "Derbyshire and Nottinghamshire", "TLF2": "Leicestershire, Rutland and Northamptonshire",
    "TLF3": "Lincolnshire", "TLG1": "Herefordshire, Worcestershire and Warwickshire",
    "TLG2": "Shropshire and Staffordshire", "TLG3": "West Midlands",
    "TLH2": "Bedfordshire and Hertfordshire", "TLH3": "Essex",
    "TLH4": "Cambridgeshire and Peterborough", "TLH5": "Norfolk", "TLH6": "Suffolk",
    "TLI3": "Inner London - West", "TLI4": "Inner London - East",
    "TLI5": "Outer London - East and North East", "TLI6": "Outer London - South",
    "TLI7": "Outer London - West and North West",
    "TLJ1": "Berkshire, Buckinghamshire and Oxfordshire", "TLJ2": "Surrey, East and West Sussex",
    "TLJ3": "Hampshire and Isle of Wight", "TLJ4": "Kent",
    "TLK3": "Cornwall and Isles of Scilly", "TLK4": "Devon", "TLK5": "West of England",
    "TLK6": "North Somerset, Somerset and Dorset", "TLK7": "Gloucestershire and Wiltshire",
    "TLL3": "North Wales", "TLL4": "Mid and South West Wales", "TLL5": "South East Wales",
    "TLM0": "Eastern Scotland", "TLM1": "East Central Scotland", "TLM2": "Highlands and Islands",
    "TLM3": "West Central Scotland", "TLM5": "North Eastern Scotland", "TLM9": "Southern Scotland",
    "TLN0": "Northern Ireland",
}

# metric key -> panel column (summed across providers in an area).
# NB: master_panel.xlsx labels its BCI / CPD / licensing / HE-funds columns "real 2024/25" but they match the
# nominal CPM_master values (the main dashboard deflates them with ay_cpi), so we deflate them here too.
NOMINAL_MONEY = {   # key -> list of source columns (summed) that are NOMINAL and need deflating
    "bci": ["bci_total"], "sme": ["bci_sme"], "lc": ["bci_lc"],
    "cr": ["bci_contract_research"], "cons": ["bci_consultancy"], "fac": ["bci_facilities"], "ip": ["bci_ip"],
    "cpd": ["cpd_tot_rev_000gbp"], "ukind": ["hefunds_uk_industry"],
    "cr_sme": ["contract_int_v_sme_000gbp"], "cr_lc": ["contract_int_v_lc_000gbp"],
    "cons_sme": ["int_v_consult_sme_000gbp"], "cons_lc": ["int_v_consult_lc_000gbp"],
    "fac_sme": ["int_v_fe_sme_000gbp"], "fac_lc": ["int_v_fe_lc_000gbp"],
    "lic": [f"license_inc_{t}_{z}_000gbp" for t in ("nsw", "ip", "sw") for z in ("nc", "lc", "sme")],
    "lic_sme": [f"license_inc_{t}_sme_000gbp" for t in ("nsw", "ip", "sw")],
    "lic_lc": [f"license_inc_{t}_lc_000gbp" for t in ("nsw", "ip", "sw")],
}
ALREADY_REAL = {"inc": "total_income_000gbp", "regen": "regen_income_000gbp", "collab": "cr_all_total"}
COUNTS = {
    "spin": ["n_spinouts_surv3"], "acad": ["acad_all"],
    "nsme": ["int_n_consult_sme", "int_n_fe_sme", "contract_int_n_sme"],
    "nlc": ["int_n_consult_lc", "int_n_fe_lc", "contract_int_n_lc"],
    "licn": ["nonsoftware_sme", "nonsoftware_lc", "software_sme", "software_lc"],
    "licn_sme": ["nonsoftware_sme", "software_sme"], "licn_lc": ["nonsoftware_lc", "software_lc"],
    "patf": ["n_patents_filed"], "patg": ["n_patents_granted"], "pate": ["n_external_patents"], "disc": ["n_disclosures"],
}
METRIC_COLS = {k: v[0] for k, v in {**NOMINAL_MONEY, **COUNTS}.items()}
METRIC_COLS.update(ALREADY_REAL)
CTX_TTWA = ["ttwa_type", "ttwa_composite_pct", "ttwa_productivity_pct", "ttwa_knowledge_pct",
            "ttwa_legacy_inv_pct", "ttwa_gva_per_job_2023", "ttwa_ki_share", "ttwa_legacy_share",
            "ttwa_jobs_bres2024", "ttwa_jobs_density", "itl2_berd_per_job"]


def load_panel(path=PANEL_PATH):
    d = pd.read_excel(path, sheet_name="Panel")
    d = d.copy()
    d["cr_partner"] = d["cr_all_partner_cash"].fillna(0) + d["cr_all_partner_inkind"].fillna(0)
    cpi = d["ay_cpi"] / 100.0
    # create one real (money) or summed (count) column per metric key, named "m_<key>"
    for k, cols in NOMINAL_MONEY.items():
        d["m_" + k] = d[cols].sum(axis=1, min_count=1) / cpi
    for k, col in ALREADY_REAL.items():
        d["m_" + k] = d[col]
    for k, cols in COUNTS.items():
        d["m_" + k] = d[cols].sum(axis=1, min_count=1)
    d["itl1_name"] = d["campus_itl2"].astype(str).str[:3].map(ITL1_NAMES)
    # providers with no campus ITL2 fall back to their HESA region (names match ITL1)
    d["itl1_name"] = d["itl1_name"].fillna(d["region_of_he_provider"])
    return d


def _num(v):
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return None
    return round(float(v), 4)


def build_place(path=PANEL_PATH):
    d = load_panel(path)
    years = sorted(d["academic_year"].unique())
    provs, ttwas, itl2s = [], {}, {}
    for ukprn, g in d.groupby("ukprn"):
        g = g.set_index("academic_year").reindex(years)
        base = d[d.ukprn == ukprn].iloc[0]
        # last non-null static fields
        rec = {
            "u": int(ukprn), "n": str(base["he_provider"]),
            "r": base["itl1_name"] if isinstance(base["itl1_name"], str) else None,
            "i2": base["campus_itl2"] if isinstance(base["campus_itl2"], str) else None,
            "t": base["ttwa_code"] if isinstance(base["ttwa_code"], str) else None,
            "cl": base["cluster"] if isinstance(base["cluster"], str) else None,
            "core": bool(base["inst_panel"] == "core"),
            "lat": _num(base["campus_lat"]), "lon": _num(base["campus_lon"]),
            "s": {},
        }
        gg = d[d.ukprn == ukprn].set_index("academic_year").reindex(years)
        for k in METRIC_COLS:
            rec["s"][k] = [_num(v) for v in gg["m_" + k].tolist()]
        rec["s"]["cpart"] = [_num(v) for v in g["cr_partner"].tolist()]
        provs.append(rec)
        if rec["t"] and rec["t"] not in ttwas:
            ttwas[rec["t"]] = {
                "name": str(base["ttwa_name"]), "type": base["ttwa_type"] if isinstance(base["ttwa_type"], str) else None,
                "comp": _num(base["ttwa_composite_pct"]), "prod": _num(base["ttwa_productivity_pct"]),
                "know": _num(base["ttwa_knowledge_pct"]), "legacy": _num(base["ttwa_legacy_inv_pct"]),
                "gva": _num(base["ttwa_gva_per_job_2023"]), "ki": _num(base["ttwa_ki_share"]),
                "legsh": _num(base["ttwa_legacy_share"]), "jobs": _num(base["ttwa_jobs_bres2024"]),
                "dens": _num(base["ttwa_jobs_density"]), "berd": _num(base["itl2_berd_per_job"]),
                "ni": bool(base["ttwa_ni_judgement"]) if not pd.isna(base["ttwa_ni_judgement"]) else False,
            }
        if rec["i2"] and rec["i2"] not in itl2s:
            itl2s[rec["i2"]] = {"name": ITL2_NAMES.get(rec["i2"], rec["i2"]),
                                "berd": _num(base["itl2_berd_per_job"]),
                                "r": ITL1_NAMES.get(rec["i2"][:3])}
    cpi = {y: _num(v) for y, v in d.groupby("academic_year")["ay_cpi"].first().items()}
    return {
        "cpi": cpi, "berd": load_berd(),
        "years": years, "provs": provs, "ttwa": ttwas, "itl2": itl2s,
        "itl1": sorted(set(ITL1_NAMES.values())),
        "metricCols": METRIC_COLS,
        "note": "£000, real 2024/25 prices. Income is recorded where the university is based (main-campus TTWA); it does not show where partners are located or where collaboration took place.",
    }


def load_berd():
    """Context data on business R&D (BERD). Everything is optional; missing files are skipped.
    input/berd_region.csv          year,area,level,value,price   (value £m; price = real|nominal) ONS BERD by ITL1/ITL2/UK/England
    input/berd_industry.csv        group,year,value              (UK BERD by broad industry group) -> % change baseline→last
    input/berd_industry_change.csv group,change_pct,baseline,last  (seed digitised from NCUB 2025; used if berd_industry.csv absent)
    input/berd_international.csv   economy,growth_pct,baseline  (seed digitised from NCUB 2025 / MSTI OECD)
    """
    import json
    out = {"region": None, "industry": None, "intl": None, "uk": None}
    p = os.path.join(INPUT_DIR, "berd_region.csv")
    if os.path.exists(p):
        r = pd.read_csv(p)
        r.columns = [c.strip().lower() for c in r.columns]
        if {"year", "area", "value"} <= set(r.columns) and len(r):
            if "level" not in r.columns: r["level"] = ""
            if "price" not in r.columns: r["price"] = "real"
            out["region"] = [{"y": int(a), "a": str(b), "l": str(c), "v": float(v), "p": str(q).lower()}
                             for a, b, c, v, q in zip(r.year, r.area, r.level, r.value, r.price) if pd.notna(v)]
    p = os.path.join(INPUT_DIR, "berd_industry.csv")
    q = os.path.join(INPUT_DIR, "berd_industry_change.csv")
    if os.path.exists(p):
        r = pd.read_csv(p); r.columns = [c.strip().lower() for c in r.columns]
        yrs = sorted(r.year.unique()); b, l = yrs[-2] if len(yrs) > 1 else yrs[0], yrs[-1]
        pv = r.pivot_table(index="group", columns="year", values="value", aggfunc="sum")
        rows = [{"g": g, "pct": float((pv.loc[g, l] / pv.loc[g, b] - 1) * 100)} for g in pv.index if pv.loc[g, b] and pd.notna(pv.loc[g, b])]
        out["industry"] = {"rows": rows, "base": int(b), "last": int(l), "src": "ONS BERD (input/berd_industry.csv)"}
    elif os.path.exists(q):
        r = pd.read_csv(q); r.columns = [c.strip().lower() for c in r.columns]
        out["industry"] = {"rows": [{"g": g, "pct": float(v)} for g, v in zip(r.group, r.change_pct)],
                           "base": int(r.baseline.iloc[0]), "last": int(r["last"].iloc[0]), "src": "NCUB (2025), based on ONS data 2024 (digitised from the NCUB figure)"}
    p = os.path.join(INPUT_DIR, "berd_international.csv")
    if os.path.exists(p):
        r = pd.read_csv(p); r.columns = [c.strip().lower() for c in r.columns]
        out["intl"] = {"rows": [{"c": c, "pct": float(v)} for c, v in zip(r.economy, r.growth_pct)], "base": int(r.baseline.iloc[0]),
                       "src": "NCUB (2025), based on ONS data 2024 and MSTI OECD (2025) (digitised from the NCUB figure)"}
    p = os.path.join(INPUT_DIR, "context_cache.json")
    if os.path.exists(p):
        b = json.load(open(p, encoding="utf-8")).get("berd")
        if b:
            out["uk"] = {"years": b["years"], "values": b["values"], "unit": "£bn", "src": "UK business enterprise R&D as shown in the NCUB 2025 context figure"}
    return out


# ───────────────── pandas helpers for the PowerPoint reports ─────────────────
LEVELS = {"itl1": "ITL1 region", "itl2": "ITL2 sub-region", "ttwa": "Travel-to-work area"}


def add_area_cols(d):
    d = d.copy()
    d["a_itl1"] = d["itl1_name"]
    d["a_itl2"] = d["campus_itl2"].map(lambda c: ITL2_NAMES.get(c, None) if isinstance(c, str) else None)
    d["a_ttwa"] = d["ttwa_name"].where(d["ttwa_code"].notna())
    return d


def area_year_table(d, level, core_only=False):
    """Area x year sums of the main metrics (+ n universities, centroid)."""
    col = {"itl1": "a_itl1", "itl2": "a_itl2", "ttwa": "a_ttwa"}[level]
    x = d[d[col].notna()]
    if core_only:
        x = x[x["inst_panel"] == "core"]
    agg = {k: ("m_" + k, "sum") for k in METRIC_COLS}
    agg["n_uni"] = ("ukprn", "nunique")
    t = x.groupby([col, "academic_year"]).agg(**agg).reset_index().rename(columns={col: "area"})
    return t


def cagr(a, b, n):
    if a is None or b is None or a <= 0 or b <= 0 or n <= 0:
        return None
    return (b / a) ** (1.0 / n) - 1


if __name__ == "__main__":
    p = build_place()
    print(len(p["provs"]), "providers;", len(p["ttwa"]), "TTWAs;", len(p["itl2"]), "ITL2")
