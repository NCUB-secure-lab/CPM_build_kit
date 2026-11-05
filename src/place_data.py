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

# metric key -> panel column(s) (summed across providers in an area)
METRIC_COLS = {
    "bci": "bci_total", "sme": "bci_sme", "lc": "bci_lc",
    "cr": "bci_contract_research", "cons": "bci_consultancy",
    "fac": "bci_facilities", "ip": "bci_ip",
    "cpd": "cpd_tot_rev_000gbp", "collab": "cr_all_total",
    "spin": "n_spinouts_surv3", "spininv": "external_investment_spin",
    "acad": "acad_all", "inc": "total_income_000gbp", "regen": "regen_income_000gbp",
}
CTX_TTWA = ["ttwa_type", "ttwa_composite_pct", "ttwa_productivity_pct", "ttwa_knowledge_pct",
            "ttwa_legacy_inv_pct", "ttwa_gva_per_job_2023", "ttwa_ki_share", "ttwa_legacy_share",
            "ttwa_jobs_bres2024", "ttwa_jobs_density", "itl2_berd_per_job"]


def load_panel(path=PANEL_PATH):
    d = pd.read_excel(path, sheet_name="Panel")
    d = d.copy()
    d["cr_partner"] = d["cr_all_partner_cash"].fillna(0) + d["cr_all_partner_inkind"].fillna(0)
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
        for k, col in METRIC_COLS.items():
            rec["s"][k] = [_num(v) for v in g[col].tolist()]
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
    return {
        "years": years, "provs": provs, "ttwa": ttwas, "itl2": itl2s,
        "itl1": sorted(set(ITL1_NAMES.values())),
        "metricCols": {k: v for k, v in METRIC_COLS.items()},
        "note": "£000, real 2024/25 prices. Income is recorded where the university is based (main-campus TTWA); it does not show where partners are located or where collaboration took place.",
    }


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
    cols = {k: v for k, v in METRIC_COLS.items()}
    agg = {k: (v, "sum") for k, v in cols.items()}
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
