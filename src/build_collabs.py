"""Helper used by build_dashboard.py to derive per-provider and national
business-collaboration aggregates from the Gateway to Research export."""
import re, json
import pandas as pd

def _key(s):
    if not isinstance(s, str): return ''
    s = s.lower().replace('&', ' and ')
    for w in [' the ', 'the ', 'university of ', ' university', 'university ',
              'college of ', 'college ', ' college', 'institute of ', 'institute ',
              ' london', ' (gsk)', ' ltd', ' limited', ' plc', ' uk', ' of ']:
        s = s.replace(w, ' ')
    s = re.sub(r'higher education corporation', '', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return ''.join(c for c in s if c.isalnum())

def build_collabs(csv_path, hesa_df):
    df = pd.read_csv(csv_path, encoding='utf-8-sig')
    df = df[df.is_uk_business == 'Yes'].copy()
    # year filter — keep observed range, drop blanks
    df = df.dropna(subset=['start_year'])
    df['start_year'] = df['start_year'].astype(int)

    # canonicalise business name (title case for display)
    df['business'] = df.business_name_clean.fillna('').astype(str).str.strip()
    # tidy lead names that come in shouting caps
    df['lead_org_name'] = df.lead_org_name.fillna('').astype(str)
    # bucket missing values neatly
    df['industry_domain'] = df.industry_domain.fillna('Other / Unclassified').replace('', 'Other / Unclassified')
    df['collab_type'] = df.collab_type.fillna('Other').replace('', 'Other')
    df['collab_sector'] = df.collab_sector.fillna('Unclassified').replace('', 'Unclassified')
    df['funder'] = df.funder.fillna('Other').replace('', 'Other')
    df['grant_category'] = df.grant_category.fillna('Other').replace('', 'Other')

    # ── match lead org to HESA UKPRN ────────────────────────────────────
    hesa_map = {_key(n): str(u) for n, u in zip(hesa_df.he_provider, hesa_df.ukprn) if _key(n)}
    def match(name):
        k = _key(name)
        if not k: return None
        if k in hesa_map: return hesa_map[k]
        if len(k) < 8: return None
        # substring fallback
        for hk, v in hesa_map.items():
            if len(hk) >= 8 and (hk in k or k in hk): return v
        return None
    df['ukprn_match'] = df.lead_org_name.apply(match)

    years = sorted(df.start_year.unique())

    # ── national aggregates ─────────────────────────────────────────────
    def topn(series, n=20, lower=False):
        # series may be a pd.Series of values; we want value->count
        s = series.value_counts().head(n)
        return [{'name': (k.title() if lower else k), 'count': int(v)} for k, v in s.items()]

    national = {
        'years': years,
        'total_links': len(df),
        'unique_businesses': int(df.business[df.business != ''].nunique()),
        'unique_leads': int(df.lead_org_name[df.lead_org_name != ''].nunique()),
        'projects_with_business': int(df.grant_reference.nunique()),
        'total_grant_value': float(df.value_pounds.sum()),
        'mean_grant_value': float(df.value_pounds.mean()),
        'by_year': {int(y): int(c) for y, c in df.start_year.value_counts().sort_index().items()},
        'value_by_year': {int(y): float(v) for y, v in df.groupby('start_year').value_pounds.sum().items()},
        'top_businesses': topn(df.business[df.business != ''], 20),
        'by_industry': topn(df.industry_domain, 20),
        'by_collab_type': topn(df.collab_type, 12),
        'by_sector': topn(df.collab_sector, 10),
        'by_funder': topn(df.funder, 15),
        'by_grant_cat': topn(df.grant_category, 12),
    }

    # ── per-provider aggregates ─────────────────────────────────────────
    per = {}
    m = df[df['ukprn_match'].notna()].copy()
    for ukprn, g in m.groupby('ukprn_match'):
        per[str(ukprn)] = {
            'total_links': len(g),
            'unique_businesses': int(g.business[g.business != ''].nunique()),
            'unique_projects': int(g.grant_reference.nunique()),
            'total_grant_value': float(g.value_pounds.sum()),
            'by_year': {int(y): int(c) for y, c in g.start_year.value_counts().sort_index().items()},
            'value_by_year': {int(y): float(v) for y, v in g.groupby('start_year').value_pounds.sum().items()},
            'top_businesses': topn(g.business[g.business != ''], 20),
            'by_industry': topn(g.industry_domain, 15),
            'by_collab_type': topn(g.collab_type, 10),
            'by_funder': topn(g.funder, 10),
            'by_grant_cat': topn(g.grant_category, 10),
        }

    out = {'years': [int(y) for y in years], 'national': national, 'per_provider': per,
            'matched_share': round(len(m) / len(df) * 100, 1),
            'matched_providers': int(m['ukprn_match'].nunique()),
            'unmatched_top': {str(k): int(v) for k, v in df[df['ukprn_match'].isna()].lead_org_name.value_counts().head(10).items()}}
    import numpy as np
    def fix(o):
        if isinstance(o, dict): return {str(k): fix(v) for k, v in o.items()}
        if isinstance(o, list): return [fix(v) for v in o]
        if isinstance(o, (np.integer,)): return int(o)
        if isinstance(o, (np.floating,)): return float(o)
        return o
    return fix(out)

if __name__ == '__main__':
    import sys, os
    HERE = os.path.dirname(os.path.abspath(__file__))
    ROOT = os.path.dirname(HERE)
    INPUT_DIR = os.path.join(ROOT, 'input')
    hesa_path = sys.argv[2] if len(sys.argv) > 2 else os.path.join(INPUT_DIR, 'hesa_panel_clean.csv')
    csv_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(INPUT_DIR, 'business_collabs.csv')
    hesa = pd.read_csv(hesa_path)
    out = build_collabs(csv_path, hesa)
    print(json.dumps({k: (v if isinstance(v, (int, float, str, dict)) else f'<{type(v).__name__}>') for k, v in out['national'].items() if k not in ('top_businesses','by_industry','by_collab_type','by_sector','by_funder','by_grant_cat','by_year','value_by_year')}, indent=1))
    print('matched share:', out['matched_share'], '% across', out['matched_providers'], 'providers')
