"""
match_cases.py — match NCUB case studies to HESA providers at build time
=========================================================================

Called by build_dashboard.py. For each case study, finds every HESA provider
mentioned (lead OR contributing universities), writes `ukprns` and
`uni_names` lists onto the record, and emits case_match_audit.csv so you
can hand-correct edge cases.

Match logic, in order of precedence:
 1. Explicit alias table (UCL → University College London, etc.)
 2. Exact normalised-key match (lowercased, suffixes stripped)
 3. Token-set match via rapidfuzz with score ≥ 88
 4. Substring containment (only for keys ≥ 10 chars, to avoid false positives)

Multi-university extraction: pulls candidates from (a) the case's `university`
field (split on commas, "and", "&", ";"), and (b) regex scan of the title +
summary for "University of X", "X University", and well-known aliases.
"""
import os, re, csv, json

# ── Known aliases / disambiguators ────────────────────────────────────────
# Short/colloquial name → exact HESA he_provider name. Verified against the
# 2024/25 HE-BCI panel. Single-city short names (e.g. "Birmingham",
# "Newcastle") are NOT here because they're ambiguous — those rely on the
# full normalised match instead.
ALIASES = {
    "ucl": "University College London",
    "ucl school of pharmacy": "University College London",
    "kcl": "King's College London",
    "lse": "The London School of Economics and Political Science",
    "lshtm": "London School of Hygiene and Tropical Medicine",
    "imperial": "Imperial College of Science, Technology and Medicine",
    "imperial college": "Imperial College of Science, Technology and Medicine",
    "imperial college london": "Imperial College of Science, Technology and Medicine",
    "queen mary": "Queen Mary University of London",
    "queen mary university": "Queen Mary University of London",
    "qmul": "Queen Mary University of London",
    "soas": "SOAS University of London",
    "qub": "Queen's University Belfast",
    "queen's belfast": "Queen's University Belfast",
    "ljmu": "Liverpool John Moores University",
    "uwe": "The University of the West of England, Bristol",
    "uwe bristol": "The University of the West of England, Bristol",
    "the open university": "The Open University",
    "open university": "The Open University",
}

SUFFIXES_TO_STRIP = [
    " university", " college", " school", " institute", " of technology",
]

# ── Normalisation ─────────────────────────────────────────────────────────
def _norm(s):
    if not s: return ""
    s = s.lower()
    s = re.sub(r"^the\s+", "", s)
    # strip common qualifiers but keep the distinctive word
    s = s.replace(" and the ", " ").replace(" and ", " ")
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s

def _stem(s):
    """A stricter key — removes 'university' too, for cross-matching with HESA."""
    s = _norm(s)
    for suf in SUFFIXES_TO_STRIP:
        s = s.replace(suf, " ")
    return re.sub(r"\s+", " ", s).strip()

# ── Multi-uni extraction from text ────────────────────────────────────────
SPLIT_RE = re.compile(r"\s*(?:,|;|/| and |&| with )\s*", re.I)
UNI_PATTERNS = [
    re.compile(r"(?:the\s+)?university\s+of\s+([A-Z][\w\-' ]{2,40}?)(?=[,.\s\(]|$)"),
    re.compile(r"([A-Z][\w\-' ]{2,40}?)\s+university\b"),
    re.compile(r"([A-Z][\w\-' ]{2,40}?)\s+college\s+(?:of|london|university)"),
]

def extract_candidates(case):
    """Return a deduped list of candidate institution name strings for a case."""
    cands = []
    # 1. Split the `university` field on common separators
    if case.get("university"):
        for piece in SPLIT_RE.split(case["university"]):
            p = piece.strip()
            if len(p) >= 3: cands.append(p)
    # 2. Regex scan the title + summary
    text = (case.get("title") or "") + ". " + (case.get("summary") or "")
    for pat in UNI_PATTERNS:
        for m in pat.finditer(text):
            full = m.group(0).strip().rstrip(".,;")
            if 4 <= len(full) <= 80: cands.append(full)
    # 3. Check for alias keywords in title text (catches "UCL", "Imperial" alone)
    text_lower = " " + text.lower() + " "
    for alias in ALIASES:
        if len(alias) >= 3 and (" " + alias + " ") in text_lower:
            cands.append(alias)
    # dedupe preserving order
    seen, out = set(), []
    for c in cands:
        k = c.lower().strip()
        if k not in seen:
            seen.add(k); out.append(c)
    return out

# ── Matcher ───────────────────────────────────────────────────────────────
def build_matcher(hesa_providers):
    """Return a callable name->(ukprn, hesa_name, confidence, method) or None."""
    # ukprn -> name, plus inverted lookups
    by_ukprn = dict(zip(hesa_providers.he_provider, hesa_providers.ukprn.astype(str)))
    norm_to_name = {_norm(n): n for n in hesa_providers.he_provider}
    stem_to_name = {}
    for n in hesa_providers.he_provider:
        k = _stem(n)
        if k and k not in stem_to_name:  # first wins on duplicates
            stem_to_name[k] = n
    # alias table → name (normalised aliases)
    alias_to_name = {}
    for short, full in ALIASES.items():
        if full in by_ukprn:
            alias_to_name[_norm(short)] = full
    # rapidfuzz choices
    try:
        from rapidfuzz import process, fuzz
        FUZZ_OK = True
    except ImportError:
        FUZZ_OK = False
        print("  (rapidfuzz not installed — fuzzy matching disabled; pip install rapidfuzz)")
    stem_keys = list(stem_to_name.keys())

    def match(candidate):
        if not candidate: return None
        nk = _norm(candidate)
        if not nk: return None
        # 1. alias
        if nk in alias_to_name:
            name = alias_to_name[nk]
            return (by_ukprn[name], name, 100, "alias")
        # 2. exact normalised name
        if nk in norm_to_name:
            name = norm_to_name[nk]
            return (by_ukprn[name], name, 100, "exact")
        # 3. exact stem match
        sk = _stem(candidate)
        if sk and sk in stem_to_name:
            name = stem_to_name[sk]
            return (by_ukprn[name], name, 96, "stem")
        # 4. fuzzy match against stems
        if FUZZ_OK and sk and len(sk) >= 4:
            best = process.extractOne(sk, stem_keys, scorer=fuzz.token_set_ratio, score_cutoff=88)
            if best:
                _, score, _idx = best
                name = stem_to_name[best[0]]
                return (by_ukprn[name], name, int(score), "fuzzy")
        # 5. substring containment, requiring length >= 10 to avoid false positives
        if len(sk) >= 10:
            for k, name in stem_to_name.items():
                if len(k) >= 10 and (k in sk or sk in k):
                    return (by_ukprn[name], name, 80, "substring")
        return None
    return match

# ── Main entry point ──────────────────────────────────────────────────────
def enrich_cases(cases, hesa_providers, audit_path=None):
    """Annotate each case in-place with 'ukprns' and 'uni_names' lists,
    plus 'match_confidence' (lowest method confidence used). Returns
    audit rows for the CSV log."""
    matcher = build_matcher(hesa_providers)
    audit = []
    n_matched_any, n_matched_multi = 0, 0
    for c in cases:
        cands = extract_candidates(c)
        hits = {}    # ukprn -> (name, confidence, method, source_text)
        for cand in cands:
            r = matcher(cand)
            if r:
                ukprn, name, conf, method = r
                if ukprn not in hits or hits[ukprn][1] < conf:
                    hits[ukprn] = (name, conf, method, cand)
        c["ukprns"] = list(hits.keys())
        c["uni_names"] = [v[0] for v in hits.values()]
        c["match_confidence"] = min((v[1] for v in hits.values()), default=0)
        if hits: n_matched_any += 1
        if len(hits) > 1: n_matched_multi += 1
        audit.append({
            "title": (c.get("title") or "")[:120],
            "url": c.get("url",""),
            "original_university": c.get("university") or "",
            "candidates_scanned": " | ".join(cands)[:300],
            "matched_providers": " | ".join(v[0] for v in hits.values()),
            "matched_ukprns": " | ".join(hits.keys()),
            "methods": " | ".join(v[2] for v in hits.values()),
            "min_confidence": c["match_confidence"],
            "needs_review": "yes" if not hits or c["match_confidence"] < 90 else "",
        })
    if audit_path:
        with open(audit_path, "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(audit[0].keys()) if audit else [])
            if audit: w.writeheader(); w.writerows(audit)
    return {"n_total": len(cases), "n_matched_any": n_matched_any,
            "n_matched_multi": n_matched_multi}
