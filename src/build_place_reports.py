"""
build_place_reports.py — editable NCUB-style PowerPoint reports for place analysis.

Reads input/master_panel.xlsx and the NCUB slide template input/NCUB_guide_presentations.pptx
and writes to output/place_reports/:
        ITL1/<region>.pptx, ITL2/<sub-region>.pptx, TTWA/<area>.pptx

All charts are native PowerPoint charts (right-click → Edit data), all text is editable.

Usage:  python src/build_place_reports.py            # everything
        python src/build_place_reports.py --only itl1  # one level (or: uk, itl2, ttwa)
"""
import os, re, sys, copy
import numpy as np
import pandas as pd
from pptx import Presentation
from pptx.util import Emu, Pt, Inches
from pptx.dml.color import RGBColor
from pptx.chart.data import CategoryChartData, XyChartData
from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION, XL_LABEL_POSITION, XL_TICK_LABEL_POSITION
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE

import place_data as pdx

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
TEMPLATE = os.path.join(ROOT, "input", "NCUB_guide_presentations.pptx")
OUT = os.path.join(ROOT, "output", "place_reports")

PUR, MID, PNK, LIGHT = "3E1151", "60537F", "FF0090", "F0EAF4"
FONT = "Aptos"
REG_COL = dict(zip(sorted(pdx.ITL1_NAMES.values()),
                   ["FF0090", "0085CA", "00B388", "E8A600", "3E1151", "7B3FE4", "00A3A1", "C2185B", "6D8F00", "E8710A", "8D6E63", "3A6EA5"]))
YEARS = None


def rgb(h):
    return RGBColor.from_string(h)


# ───────────────────────────── data ─────────────────────────────
class Data:
    def __init__(self):
        global YEARS
        d = pdx.add_area_cols(pdx.load_panel())
        self.d = d
        YEARS = sorted(d["academic_year"].unique())
        self.ty = len(YEARS) - 1
        self.core = d["inst_panel"] == "core"
        self.uk_all = self._uk(d)
        self.uk_core = self._uk(d[self.core])
        eng = d[~d["itl1_name"].isin(["Scotland", "Wales", "Northern Ireland"])]
        self.eng_all, self.eng_core = self._uk(eng), self._uk(eng[eng.inst_panel == "core"])
        rep = lambda x: x[x["bci_total"].notna()].groupby("academic_year")["ukprn"].nunique().reindex(YEARS)
        self.n_uk, self.n_eng = rep(d), rep(eng)
        self.tab = {}
        for lvl in ("itl1", "itl2", "ttwa"):
            self.tab[(lvl, "all")] = self._area_tab(lvl, False)
            self.tab[(lvl, "core")] = self._area_tab(lvl, True)
        # place context per TTWA
        p = d.drop_duplicates("ukprn")
        self.ttwa_ctx = (p[p.ttwa_code.notna()].drop_duplicates("ttwa_code")
                         .set_index("ttwa_name")[["ttwa_type", "ttwa_ki_share", "ttwa_gva_per_job_2023", "ttwa_jobs_bres2024",
                                                  "ttwa_composite_pct", "ttwa_productivity_pct", "ttwa_knowledge_pct", "ttwa_legacy_share"]])
        yb, yl = YEARS[self.ty - 5], YEARS[self.ty]
        piv = d.pivot_table(index="ukprn", columns="academic_year", values="m_bci", aggfunc="sum")
        b0, b1 = piv[yb], piv[yl]
        g = ((b1 / b0) ** (1 / 5) - 1) * 100
        band = pd.Series(np.nan, index=piv.index)
        ok = (b0 >= 100) & b1.notna()
        band[ok] = np.select([g[ok] >= 10, g[ok] >= 3, g[ok] > -3, g[ok] > -10], [0, 1, 2, 3], 4)
        self.band = band
        cpi = {a: float(v) for a, v in d.groupby("academic_year")["ay_cpi"].first().items()}
        self.cpi = cpi
        self.berd = pdx.load_berd(cpi)
        self.itl2_berd = p[p.campus_itl2.notna()].drop_duplicates("campus_itl2").set_index("a_itl2")["itl2_berd_per_job"]

    def _uk(self, d):
        g = d.groupby("academic_year")
        t = pd.DataFrame({k: g[col].sum(min_count=1) for k, col in pdx.METRIC_COLS.items()}).reindex(YEARS)
        return t

    def _area_tab(self, lvl, core):
        col = {"itl1": "a_itl1", "itl2": "a_itl2", "ttwa": "a_ttwa"}[lvl]
        x = self.d[self.d[col].notna()]
        if core:
            x = x[x.inst_panel == "core"]
        g = x.groupby([col, "academic_year"])
        t = pd.DataFrame({k: g[c].sum(min_count=1) for k, c in pdx.METRIC_COLS.items()})
        t["n"] = g["ukprn"].nunique()
        return t  # MultiIndex (area, year)

    def series(self, lvl, area, k, core=False):
        t = self.tab[(lvl, "core" if core else "all")]
        if area not in t.index.get_level_values(0):
            return pd.Series([np.nan] * len(YEARS), index=YEARS)
        return t.loc[area, k].reindex(YEARS)

    def latest(self, lvl, k, core=False):
        t = self.tab[(lvl, "core" if core else "all")]
        return t.xs(YEARS[self.ty], level=1)[k]

    def areas(self, lvl):
        return list(self.latest(lvl, "bci").sort_values(ascending=False).index)

    def region_of(self, lvl, area):
        if lvl == "itl1":
            return area
        col = {"itl2": "a_itl2", "ttwa": "a_ttwa"}[lvl]
        x = self.d[(self.d[col] == area) & (self.d.academic_year == YEARS[self.ty])]
        return x.groupby("itl1_name")["bci_total"].sum().idxmax() if len(x) else None

    def unis(self, lvl, area):
        col = {"itl1": "a_itl1", "itl2": "a_itl2", "ttwa": "a_ttwa"}[lvl]
        x = self.d[(self.d[col] == area) & (self.d.academic_year == YEARS[self.ty])]
        return x.sort_values("bci_total", ascending=False)


# ───────────────────────────── formatting ─────────────────────────────
def gbp(v):
    if v is None or pd.isna(v):
        return "–"
    if v >= 1e6:
        return f"£{v/1e6:.2f}bn"
    if v >= 1000:
        return f"£{v/1000:.0f}m" if v >= 100000 else f"£{v/1000:.1f}m"
    return f"£{v:.0f}k"


def pct(v, d=1, sign=False):
    if v is None or pd.isna(v):
        return "–"
    return f"{v:+.{d}f}%" if sign else f"{v:.{d}f}%"


def cagr(a, b, n=5):
    if a is None or b is None or pd.isna(a) or pd.isna(b) or a <= 0 or b <= 0:
        return np.nan
    return ((b / a) ** (1 / n) - 1) * 100


def lcase(s):
    return s[0].lower() + s[1:] if s else s


# ───────────────────────────── insights ─────────────────────────────
LVL_TXT = {"itl1": "region", "itl2": "sub-region", "ttwa": "travel-to-work area"}


def area_insights(D, lvl, area):
    y = YEARS[D.ty]
    t = D.tab[(lvl, "all")].xs(y, level=1)
    tc = D.tab[(lvl, "core")]
    uk = D.uk_all.loc[y]
    out = []
    b = t.loc[area, "bci"]
    nu = int(t.loc[area, "n"])
    eng = D.eng_all.loc[y]
    out.append(("Scale and income per university", f"{area} has {nu} universities reporting in {y} and generated {gbp(b)} of business collaboration income ({b/uk.bci*100:.1f}% of the UK total): {gbp(b/nu)} per university, against {gbp(uk.bci/D.n_uk[y])} across the UK and {gbp(eng.bci/D.n_eng[y])} in England."))
    a_ac = t.loc[area, "acad"]
    if a_ac and a_ac > 0 and uk.acad:
        lq = (b / uk.bci) / (a_ac / uk.acad)
        out.append(("Weight", f"With {a_ac/uk.acad*100:.1f}% of UK academic staff, its location quotient is {lq:.2f}: "
                    + ("more collaboration income than its academic size alone would predict." if lq > 1.05 else
                       "less collaboration income than its academic size alone would predict." if lq < .95 else "broadly in line with its academic size.")))
    # growth on stable (core) provider set
    s = D.series(lvl, area, "bci", core=True)
    u = D.uk_core["bci"]
    g, gu = cagr(s.iloc[D.ty - 5], s.iloc[D.ty]), cagr(u.iloc[D.ty - 5], u.iloc[D.ty])
    if not pd.isna(g):
        out.append(("Momentum", f"Over five years ({YEARS[D.ty-5]} to {y}) BCI at the core 136 universities grew {pct(g,1,True)} a year here, against {pct(gu,1,True)} for the UK."))
    # mix
    parts = {"contract research": "cr", "consultancy": "cons", "facilities & equipment": "fac", "IP licensing": "ip"}
    tot = sum(t.loc[area, v] for v in parts.values())
    if tot > 0:
        top = max(parts, key=lambda k: t.loc[area, parts[k]])
        ukt = sum(uk[v] for v in parts.values())
        out.append(("Mix", f"{top.capitalize()} is the largest stream ({t.loc[area, parts[top]]/tot*100:.0f}% of BCI; UK {uk[parts[top]]/ukt*100:.0f}%). SMEs supply {t.loc[area,'sme']/b*100:.0f}% of BCI against {uk.sme/uk.bci*100:.0f}% nationally." if b > 0 else ""))
    # place context
    if lvl == "ttwa" and area in D.ttwa_ctx.index:
        c = D.ttwa_ctx.loc[area]
        jobs = c.ttwa_jobs_bres2024
        if pd.notna(jobs) and jobs > 0:
            per = t["bci"] * 1000 / D.ttwa_ctx.reindex(t.index).ttwa_jobs_bres2024
            out.append(("Local economy", f"A {str(c.ttwa_type).lower()} with {jobs:,.0f} jobs. BCI per local job is £{per[area]:,.0f} (median university TTWA £{per.median():,.0f})."
                        + (f" Knowledge-intensive jobs: {c.ttwa_ki_share*100:.0f}% of employment." if pd.notna(c.ttwa_ki_share) else "")))
    elif lvl == "itl2" and area in D.itl2_berd.index and pd.notna(D.itl2_berd[area]):
        out.append(("Local economy", f"Business R&D per job in this sub-region is £{D.itl2_berd[area]:,.0f} (ONS BERD 2024)."))
    u = D.unis(lvl, area)
    if len(u) and b > 0:
        top = u.iloc[0]
        out.append(("Universities", f"{top.he_provider} is the largest contributor ({top.bci_total/b*100:.0f}% of the area's BCI)."))
    return [o for o in out if o[1]]


# ───────────────────────────── slide helpers ─────────────────────────────
class Deck:
    def __init__(self):
        self.prs = Presentation(TEMPLATE)
        self.cover_layout = self.prs.slide_layouts[0]
        self.body_layout = next(l for l in self.prs.slide_layouts if l.name == "6_Title Slide")
        # remove the three sample slides
        sldIdLst = self.prs.slides._sldIdLst
        for sldId in list(sldIdLst):
            self.prs.part.drop_rel(sldId.rId)
            sldIdLst.remove(sldId)
        # drop every layout we do not use (keeps the file small)
        keep = {self.cover_layout.name, self.body_layout.name}
        for lay in list(self.prs.slide_layouts):
            if lay.name not in keep:
                try:
                    self.prs.slide_layouts.remove(lay)
                except Exception:
                    pass
        self.page = 1

    # text
    def tx(self, slide, x, y, w, h, text, size=12, bold=False, color=PUR, font=FONT, align=None, anchor=MSO_ANCHOR.TOP, wrap=True):
        tb = slide.shapes.add_textbox(Emu(x), Emu(y), Emu(w), Emu(h))
        tf = tb.text_frame
        tf.word_wrap = wrap
        tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
        tf.vertical_anchor = anchor
        lines = text if isinstance(text, list) else [text]
        for i, ln in enumerate(lines):
            p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
            if align:
                p.alignment = align
            r = p.add_run()
            r.text = ln
            r.font.size = Pt(size)
            r.font.bold = bold
            r.font.name = font
            r.font.color.rgb = rgb(color)
        return tb

    def rect(self, slide, x, y, w, h, fill):
        s = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Emu(x), Emu(y), Emu(w), Emu(h))
        s.fill.solid()
        s.fill.fore_color.rgb = rgb(fill)
        s.line.fill.background()
        return s

    def cover(self, title, subtitle, date):
        s = self.prs.slides.add_slide(self.cover_layout)
        self.tx(s, 847060, 3004784, 6400000, 700000, title, size=30, bold=True, color="FFFFFF", font="Georgia")
        self.tx(s, 1022525, 4300000, 6400800, 900000, subtitle, size=14, color="AAA5BB")
        self.tx(s, 838200, 6205904, 5000000, 338554, date, size=12, color="FFFFFF")
        self.page = 1
        return s

    def body(self, topic, finding, chart_title, panel=None, source=""):
        s = self.prs.slides.add_slide(self.body_layout)
        self.page += 1
        self.tx(s, 1227686, 300000, 10972800, 220000, topic, size=11, bold=True, color=PNK)
        self.tx(s, 1227686, 500000, 10900000, 560000, finding, size=24, bold=True, color=PUR, anchor=MSO_ANCHOR.MIDDLE)
        self.tx(s, 1227686, 1075000, 10900000, 330000, chart_title, size=14, color=MID)
        if panel:
            self.rect(s, 8591550, 1724025, 3105150, 4514850, PUR)
            self.rect(s, 8848725, 2038350, 428625, 47625, PNK)
            self.tx(s, 8848725, 2200000, 2590800, 900000, panel[0], size=(30 if len(panel[0]) <= 9 else 18), bold=True, color="FFFFFF")
            self.tx(s, 8858250, 3200000, 2571750, 900000, panel[1], size=13, bold=True, color="FFFFFF")
            self.tx(s, 8858250, 4295775, 2571750, 1800000, panel[2], size=11.5, color="FFFFFF")
        self.tx(s, 504825, 6391275, 10477500, 300000,
                "Source: HE-BCI via NCUB master panel, real 2024/25 prices. Income is recorded at each university's main campus. " + source,
                size=8, color=MID)
        self.tx(s, 11277600, 6391275, 428625, 228600, f"{self.page:02d}", size=9, bold=True, color=PUR, align=PP_ALIGN.RIGHT)
        return s

    def save(self, path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        self.prs.save(path)


CH = (495300, 1724025, 7848600, 4514850)


def style_chart(ch, legend=True, size=10):
    ch.has_title = False
    ch.font.size = Pt(size)
    ch.font.name = FONT
    ch.font.color.rgb = rgb(PUR)
    ch.has_legend = legend
    if legend:
        ch.legend.position = XL_LEGEND_POSITION.BOTTOM
        ch.legend.include_in_layout = False


def bar_chart(deck, slide, names, values, colors, fmt='#,##0.0', series="Value"):
    cd = CategoryChartData()
    cd.categories = names
    cd.add_series(series, [None if (v is None or (isinstance(v, float) and np.isnan(v))) else v for v in values])
    gf = slide.shapes.add_chart(XL_CHART_TYPE.BAR_CLUSTERED, *[Emu(v) for v in CH], cd)
    ch = gf.chart
    style_chart(ch, legend=False, size=10)
    ch.category_axis.reverse_order = True
    ch.category_axis.tick_label_position = XL_TICK_LABEL_POSITION.LOW
    ch.category_axis.format.line.fill.background()
    va = ch.value_axis
    va.has_major_gridlines = True
    va.major_gridlines.format.line.color.rgb = rgb("EEEBF1")
    va.format.line.fill.background()
    va.tick_labels.font.size = Pt(9)
    pl = ch.plots[0]
    pl.gap_width = 40
    pl.has_data_labels = True
    pl.data_labels.number_format = fmt
    pl.data_labels.number_format_is_linked = False
    pl.data_labels.font.size = Pt(9)
    pl.data_labels.position = XL_LABEL_POSITION.OUTSIDE_END
    for i, c in enumerate(colors):
        pt = pl.series[0].points[i]
        pt.format.fill.solid()
        pt.format.fill.fore_color.rgb = rgb(c)
    return ch


def line_chart(deck, slide, cats, series, colors, fmt="0"):
    cd = CategoryChartData()
    cd.categories = cats
    for n, v in series:
        cd.add_series(n, [None if pd.isna(x) else float(x) for x in v])
    gf = slide.shapes.add_chart(XL_CHART_TYPE.LINE_MARKERS, *[Emu(v) for v in CH], cd)
    ch = gf.chart
    style_chart(ch)
    ch.value_axis.major_gridlines.format.line.color.rgb = rgb("EEEBF1")
    ch.value_axis.tick_labels.number_format = fmt
    ch.value_axis.tick_labels.number_format_is_linked = False
    ch.value_axis.format.line.fill.background()
    for s, c in zip(ch.plots[0].series, colors):
        s.format.line.color.rgb = rgb(c)
        s.format.line.width = Pt(3)
        s.smooth = False
        s.marker.format.fill.solid()
        s.marker.format.fill.fore_color.rgb = rgb(c)
        s.marker.format.line.color.rgb = rgb(c)
    return ch


def stack100_chart(deck, slide, cats, series, colors):
    cd = CategoryChartData()
    cd.categories = cats
    for n, v in series:
        cd.add_series(n, [None if (x is None or (isinstance(x, float) and np.isnan(x))) else x for x in v])
    gf = slide.shapes.add_chart(XL_CHART_TYPE.BAR_STACKED_100, *[Emu(v) for v in CH], cd)
    ch = gf.chart
    style_chart(ch)
    ch.category_axis.reverse_order = True
    ch.value_axis.major_gridlines.format.line.color.rgb = rgb("EEEBF1")
    ch.plots[0].gap_width = 50
    ch.plots[0].overlap = 100
    for s, c in zip(ch.plots[0].series, colors):
        s.format.fill.solid()
        s.format.fill.fore_color.rgb = rgb(c)
    return ch



def stacked_col_chart(deck, slide, cats, series, colors, fmt="0"):
    cd = CategoryChartData()
    cd.categories = cats
    for n, v in series:
        cd.add_series(n, [0 if (x is None or pd.isna(x)) else float(x) for x in v])
    gf = slide.shapes.add_chart(XL_CHART_TYPE.COLUMN_STACKED, *[Emu(v) for v in CH], cd)
    ch = gf.chart
    style_chart(ch, legend=True)
    ch.plots[0].gap_width = 50
    ch.value_axis.major_gridlines.format.line.color.rgb = rgb("EEEBF1")
    ch.value_axis.tick_labels.font.size = Pt(9)
    ch.category_axis.tick_labels.font.size = Pt(9)
    for i, c in enumerate(colors):
        ch.series[i].format.fill.solid(); ch.series[i].format.fill.fore_color.rgb = rgb(c)
    return ch


def berd_real(D, y):
    k = f"{y}/{str((y + 1) % 100).zfill(2)}"
    return D.cpi.get(k, 100.0) / 100.0


def berd_series(D, names):
    """real £m by calendar year for the first name that has ONS BERD data"""
    R = D.berd.get("region") or []
    norm = lambda x: re.sub(r"[^a-z0-9]", "", str(x).lower())
    for n in names:
        rows = [r for r in R if norm(r["a"]) == norm(n)]
        if rows:
            return n, {r["y"]: r["v"] / berd_real(D, r["y"]) for r in rows}
    return None, {}


BANDS = [("Significant increase", "FEDB00"), ("Moderate increase", "0085CA"), ("Stable", "AAA5BB"), ("Moderate decline", "FF0090"), ("Significant decline", "3E1151")]


def band_shares(D, ukprns):
    b = D.band.reindex(list(ukprns)).dropna()
    n = len(b)
    return n, [round(float((b == i).sum()) / n * 100, 1) if n else 0 for i in range(5)]


def table(deck, slide, header, rows, widths, x=495300, y=1800000):
    h = 340000
    gf = slide.shapes.add_table(len(rows) + 1, len(header), Emu(x), Emu(y), Emu(sum(widths)), Emu(h * (len(rows) + 1)))
    tb = gf.table
    for j, w in enumerate(widths):
        tb.columns[j].width = Emu(w)
    for j, t in enumerate(header):
        c = tb.cell(0, j)
        c.text = t
        c.fill.solid()
        c.fill.fore_color.rgb = rgb(PUR)
        for p in c.text_frame.paragraphs:
            for r in p.runs:
                r.font.size = Pt(10); r.font.bold = True; r.font.color.rgb = rgb("FFFFFF"); r.font.name = FONT
            if j >= len(header) - 2:
                p.alignment = PP_ALIGN.RIGHT
    for i, row in enumerate(rows, start=1):
        for j, v in enumerate(row):
            c = tb.cell(i, j)
            c.text = str(v)
            c.fill.solid()
            c.fill.fore_color.rgb = rgb("FFFFFF" if i % 2 else LIGHT)
            for p in c.text_frame.paragraphs:
                for r in p.runs:
                    r.font.size = Pt(10); r.font.name = FONT; r.font.color.rgb = rgb(PUR)
                if j >= len(header) - 2:
                    p.alignment = PP_ALIGN.RIGHT
    return tb


def findings_slide(deck, title, insights):
    s = deck.body("Key findings", title, "Generated from the NCUB master panel", source="")
    lines = []
    y = 1750000
    for head, text in insights[:6]:
        deck.tx(s, 495300, y, 11000000, 200000, head.upper(), size=10, bold=True, color=PNK)
        deck.tx(s, 495300, y + 215000, 11200000, 520000, text, size=13, color=PUR)
        y += 770000
    return s


# ───────────────────────────── report builders ─────────────────────────────
def date_str():
    import datetime
    return datetime.date.today().strftime("%B %Y")


def build_area_deck(D, lvl, area, path):
    y = YEARS[D.ty]
    deck = Deck()
    region = D.region_of(lvl, area)
    deck.cover(area, f"University–business collaboration in this {LVL_TXT[lvl]}", f"Collaboration Progress Monitor · {y} · {date_str()}")
    ins = area_insights(D, lvl, area)
    findings_slide(deck, f"{area}: key findings", ins)


    # ───────── PART 1: the place at a glance (place only) ─────────
    u_n = D.series(lvl, area, "n")
    bci_s = D.series(lvl, area, "bci")
    i0 = int(np.argmax(bci_s.notna().values & (bci_s.fillna(0).values > 0)))
    yoy = [None] + [((bci_s.iloc[i] / bci_s.iloc[i - 1] - 1) * 100 if bci_s.iloc[i - 1] and bci_s.iloc[i - 1] > 0 and pd.notna(bci_s.iloc[i]) else None) for i in range(1, len(YEARS))]
    g5a = cagr(bci_s.iloc[D.ty - 5], bci_s.iloc[D.ty])
    s = deck.body("Part 1 · Collaboration income", f"Business collaboration income in {area}: {pct(yoy[-1],1,True) if yoy[-1] is not None else 'n/a'} on the year",
                  "Annual growth of BCI (%), real prices",
                  panel=(pct(g5a, 1, True) if not pd.isna(g5a) else "n/a", "a year over five years (CAGR)", f"BCI was {gbp(bci_s.iloc[D.ty])} in {y}, {pct((bci_s.iloc[D.ty]/bci_s.iloc[4]-1)*100,0,True) if bci_s.iloc[4] else 'n/a'} against 2018/19."))
    line_chart(deck, s, YEARS, [("BCI growth on previous year (%)", [round(v, 1) if v is not None else None for v in yoy])], [PNK], fmt="0")
    parts_c = [("Consultancy", "cons"), ("Facilities & equipment", "fac"), ("Contract research", "cr"), ("Licensing / IP", "ip"), ("SME", "sme"), ("Large business", "lc")]
    T0, T1 = bci_s.iloc[i0], bci_s.iloc[D.ty]
    vals = [round(((D.series(lvl, area, k).iloc[D.ty] or 0) - (D.series(lvl, area, k).iloc[i0] or 0)) / T0 * 100, 1) for _, k in parts_c]
    tot = round((T1 / T0 - 1) * 100, 1)
    s = deck.body("Part 1 · Collaboration income", "What drove the change in income?", f"Contribution to change in BCI, percentage points, {YEARS[i0]} to {y}",
                  panel=(pct(tot, 1, True), "total change in BCI", "Contribution = share of income in the first year × % change of that stream or business size."))
    bar_chart(deck, s, ["Total BCI change"] + [n for n, _ in parts_c], [tot] + vals, [PUR, "0085CA", "00B388", PNK, "6D5F8F", "8C7BB0", "1A0524"], fmt='0.0"pp"', series="pp")
    ind = [("UK industry", "ukind"), ("EU industry", "ind_eu"), ("Non-EU industry", "ind_non")]
    s = deck.body("Part 1 · Commercialisation", "Industry funding to universities", "£m, real 2024/25 prices (total for the place)",
                  panel=(gbp(sum((D.series(lvl, area, k).iloc[D.ty] or 0) for _, k in ind)), f"funds from industry, {y}", "Funds for university R&D from UK, EU and non-EU industry (HE-BCI)."))
    stacked_col_chart(deck, s, YEARS, [(n, (D.series(lvl, area, k) / 1000).round(2).tolist()) for n, k in ind], [PUR, "0085CA", PNK])
    s = deck.body("Part 1 · Spin-outs", "New and surviving spin-outs", "Spin-outs active after 3+ years and newly registered, totals",
                  panel=(str(int(D.series(lvl, area, "spin").iloc[D.ty] or 0)), f"surviving spin-outs, {y}", f"{int(D.series(lvl, area, 'sp_new').iloc[D.ty] or 0)} newly registered in the year (CPM definition)."))
    line_chart(deck, s, YEARS, [("Active after 3 years", D.series(lvl, area, "spin").tolist()), ("Newly registered", D.series(lvl, area, "sp_new").tolist())], [PNK, "0085CA"], fmt="0")
    s = deck.body("Part 1 · Spin-outs", "Spin-outs, staff and student start-ups", "Firms active after 3+ years, totals")
    stacked_col_chart(deck, s, YEARS, [("Spin-outs", D.series(lvl, area, "spin").tolist()), ("Staff start-ups", D.series(lvl, area, "staff_su").tolist()), ("Student start-ups", D.series(lvl, area, "stud_su").tolist())], [PUR, PNK, "0085CA"])
    fte = D.series(lvl, area, "sp_fte"); nsp = D.series(lvl, area, "spin")
    s = deck.body("Part 1 · Spin-outs", "Employment in spin-outs and start-ups", "Estimated current employment (FTE) of active firms",
                  panel=(f"{int(fte.iloc[D.ty] or 0):,}", f"FTE in spin-outs, {y}", f"{(fte.iloc[D.ty]/nsp.iloc[D.ty]):.1f} FTE per surviving spin-out." if nsp.iloc[D.ty] else ""))
    stacked_col_chart(deck, s, YEARS, [("Spin-outs", fte.tolist()), ("Staff start-ups", D.series(lvl, area, "staff_fte").tolist()), ("Student start-ups", D.series(lvl, area, "stud_fte").tolist())], [PUR, PNK, "0085CA"])
    s = deck.body("Part 1 · Spin-outs", "Spin-outs and external investment", "Estimated external investment received by active spin-outs, £m, real prices",
                  panel=(gbp(D.series(lvl, area, "ext").iloc[D.ty]), f"external investment, {y}", "Real 2024/25 prices; one anomalous provider return is excluded."))
    stacked_col_chart(deck, s, YEARS, [("External investment (£m)", [round((v or 0) / 1000, 1) if pd.notna(v) else 0 for v in D.series(lvl, area, "ext").tolist()])], [PUR])

    # ───────── PART 2: comparisons ─────────
    reg = D.region_of(lvl, area)
    nm, ser_a = berd_series(D, [area, reg])
    _, ser_u = berd_series(D, ["United Kingdom"]); _, ser_e = berd_series(D, ["England"])
    if ser_a and ser_u:
        yrs_b = sorted(ser_a)
        s = deck.body("Part 2 · Context", "Business R&D: the backdrop to collaboration", f"ONS BERD, real terms, indexed {yrs_b[0]} = 100",
                      panel=(pct((ser_a[yrs_b[-1]] / ser_a[yrs_b[0]] - 1) * 100, 1, True), f"change in business R&D, {nm}, {yrs_b[0]}–{yrs_b[-1]}" + ("" if nm == area else " (region)"), f"UK: {pct((ser_u[yrs_b[-1]]/ser_u[yrs_b[0]]-1)*100,1,True)}." + (f" England: {pct((ser_e[yrs_b[-1]]/ser_e[yrs_b[0]]-1)*100,1,True)}." if ser_e else "")),
                      source="ONS BERD 2024. Converted to real terms with the CPM price index.")
        sers = [(nm, [round(ser_a[k] / ser_a[yrs_b[0]] * 100, 1) for k in yrs_b])]
        cols_b = [PNK]
        if ser_e: sers.append(("England", [round(ser_e[k] / ser_e[yrs_b[0]] * 100, 1) for k in yrs_b])); cols_b.append("3A6EA5")
        sers.append(("United Kingdom", [round(ser_u[k] / ser_u[yrs_b[0]] * 100, 1) for k in yrs_b])); cols_b.append(MID)
        line_chart(deck, s, [str(k) for k in yrs_b], sers, cols_b, fmt="0")
    ind_rows = (D.berd.get("industry") or {}).get("rows")
    if ind_rows:
        rr = sorted(ind_rows, key=lambda r: -r["pct"])
        s = deck.body("Part 2 · Context", "Where UK business R&D is growing and falling", f"% change by broad industry group, {D.berd['industry']['base']} to {D.berd['industry']['last']}, real terms",
                      source="ONS BERD 2024, Table 5.")
        bar_chart(deck, s, [r["g"].split(";")[0][:40] for r in rr], [round(r["pct"], 1) for r in rr], [("00B388" if r["pct"] >= 0 else PNK) for r in rr], fmt='0.0"%"', series="%")

    t = D.tab[(lvl, "all")].xs(y, level=1)
    uk = D.uk_all.loc[y]
    b = t.loc[area, "bci"]
    # 1 BCI per university vs UK and England
    sa_n = D.series(lvl, area, "n")
    pa = D.series(lvl, area, "bci") / sa_n * 1 / 1000
    pu = D.uk_all["bci"] / D.n_uk / 1000
    pe = D.eng_all["bci"] / D.n_eng / 1000
    nu = int(t.loc[area, "n"])
    s = deck.body(f"Part 2 · {LVL_TXT[lvl]}", f"Business collaboration income per university in {area}",
                  "£m per reporting university, real 2024/25 prices",
                  panel=(gbp(b / max(nu, 1)), "BCI per university", f"{nu} universities reporting in {y}. UK {gbp(uk.bci / D.n_uk[y])}; England {gbp(D.eng_all.loc[y].bci / D.n_eng[y])}. Small providers pull averages down."),
                  source="Per-university = total divided by providers reporting that year.")
    line_chart(deck, s, YEARS, [(area, pa.tolist()), ("UK", pu.tolist()), ("England", pe.tolist())], [PNK, MID, "3A6EA5"], fmt="0.0")

    # 2 trend indexed (core set, stable providers)
    sa = D.series(lvl, area, "bci", core=True)
    su = D.uk_core["bci"]
    ia = sa / sa.dropna().iloc[0] * 100 if sa.notna().any() and sa.dropna().iloc[0] > 0 else sa
    iu = su / su.dropna().iloc[0] * 100
    g, gu = cagr(sa.iloc[D.ty - 5], sa.iloc[D.ty]), cagr(su.iloc[D.ty - 5], su.iloc[D.ty])
    s = deck.body("Part 2 · trend", f"BCI in {area}: {pct(g,1,True)} a year over five years" if not pd.isna(g) else f"BCI in {area} over time",
                  "Index of BCI, first year = 100, core 136 universities (stable provider set)",
                  panel=(pct(g, 1, True) if not pd.isna(g) else "n/a", "5-year CAGR, core universities", f"UK core universities: {pct(gu,1,True)} a year. Series shown indexed so small and large places can be compared."))
    line_chart(deck, s, YEARS, [(area, ia.tolist()), ("UK", iu.tolist())], [PNK, MID], fmt="0")

    # 3 mix
    parts = [("Contract research", "cr", PUR), ("Consultancy", "cons", PNK), ("Facilities & equipment", "fac", "0085CA"), ("IP licensing", "ip", "00B388")]
    rows_ = [(area, t.loc[area]), ("UK", uk)]
    ser = []
    for n, k, c in parts:
        vals = []
        for _, r in rows_:
            tot = sum(r[kk] for _, kk, _ in parts)
            vals.append(round(float(r[k]) / tot * 100, 1) if tot else 0)
        ser.append((n, vals))
    s = deck.body("Part 2 · composition", "What the collaboration income is for", f"Mix of BCI by stream, {y}",
                  panel=(pct(t.loc[area, "sme"] / b * 100, 0) if b else "–", "of BCI comes from SMEs", f"UK: {pct(uk.sme/uk.bci*100,0)}. BCI excludes CPD and non-commercial income."))
    stack100_chart(deck, s, [area, "UK"], ser, [c for *_, c in parts])


    # growth bands, place by place
    colr = {"itl1": "a_itl1", "itl2": "a_itl2", "ttwa": "a_ttwa"}[lvl]
    prov_area = D.d.drop_duplicates("ukprn").set_index("ukprn")[colr]
    rows_b = [("All providers (UK)", *band_shares(D, D.band.index)), (area, *band_shares(D, prov_area[prov_area == area].index))]
    oth = []
    for a in prov_area.dropna().unique():
        if a == area: continue
        n_, sh_ = band_shares(D, prov_area[prov_area == a].index)
        if n_ >= (1 if lvl == "itl1" else 4): oth.append((a, n_, sh_))
    oth.sort(key=lambda r: -(r[2][0] + r[2][1]))
    rows_b += oth[:12 if lvl == "itl1" else 14]
    s = deck.body("Part 2 · Growth", "How many universities are growing or shrinking?", f"Share of universities by five-year growth band, total BCI, {YEARS[D.ty-5]} to {y}",
                  panel=(str(rows_b[1][1]), f"universities counted in {area}", "Significant = 10%+ a year, moderate 3–10%, stable within ±3%. Universities with under £100k in the base year are excluded. The picked place is the second bar."))
    cd = CategoryChartData(); cd.categories = [f"{r[0][:34]} ({r[1]})" for r in rows_b]
    for i, (bn, _) in enumerate(BANDS): cd.add_series(bn, [r[2][i] for r in rows_b])
    gf = s.shapes.add_chart(XL_CHART_TYPE.BAR_STACKED_100, *[Emu(v) for v in CH], cd)
    ch = gf.chart; style_chart(ch, legend=True, size=9); ch.category_axis.reverse_order = True
    ch.category_axis.tick_label_position = XL_TICK_LABEL_POSITION.LOW
    ch.plots[0].gap_width = 40
    for i, (_, c) in enumerate(BANDS):
        ch.series[i].format.fill.solid(); ch.series[i].format.fill.fore_color.rgb = rgb(c)
    # scatter: university BCI per local job vs knowledge-intensive share, by type of university
    CL = ["Anchored research-intensive", "Contract-research growers", "SME & locally embedded growers", "Contracting collaborators", "Regeneration-exposed, eroding", "Other / not clustered"]
    CLC = [PUR, PNK, "0085CA", "00B388", "E8A600", "B8B0C9"]
    pp_ = D.d[D.d.academic_year == y].copy()
    pp_ = pp_[pp_.ttwa_ki_share.notna() & (pp_.ttwa_jobs_bres2024 > 0) & (pp_.m_bci > 0)]
    pp_["xk"] = pp_.ttwa_ki_share * 100
    pp_["yk"] = pp_.m_bci * 1000 / pp_.ttwa_jobs_bres2024
    def cl_i(c):
        if isinstance(c, str):
            for i, n in enumerate(CL[:5]):
                if c.startswith(n): return i
        return 5
    pp_["cli"] = pp_.cluster.map(cl_i)
    mine_u = set(D.d[D.d[colr] == area].ukprn)
    pp_["mine"] = pp_.ukprn.isin(mine_u)
    if len(pp_):
        xs = XyChartData(); names, cols = [], []
        for i, n in enumerate(CL):
            g_ = pp_[(pp_.cli == i) & ~pp_.mine]
            if len(g_):
                sr = xs.add_series(n)
                for r in g_.itertuples(): sr.add_data_point(float(r.xk), float(r.yk))
                cols.append(CLC[i])
        gm = pp_[pp_.mine]
        sm = xs.add_series(f"{area} universities")
        for r in gm.itertuples(): sm.add_data_point(float(r.xk), float(r.yk))
        cols.append("FF0090")
        s = deck.body("Part 2 · Local economy", "Collaboration income and the knowledge economy, by type of university", f"University BCI per local job (£) against knowledge-intensive employment in its area (%), {y}",
                      panel=(str(len(pp_)), "universities plotted", f"Coloured by university type; {area} universities in pink" + ("" if len(gm) else " (none with area data)") + ". Income is recorded where the university is based."))
        gf = s.shapes.add_chart(XL_CHART_TYPE.XY_SCATTER, *[Emu(v) for v in CH], xs)
        ch = gf.chart; style_chart(ch, legend=True, size=9)
        ch.value_axis.major_gridlines.format.line.color.rgb = rgb("EEEBF1")
        for sr, c in zip(ch.plots[0].series, cols):
            sr.marker.size = 9 if c != "FF0090" else 13
            sr.marker.format.fill.solid(); sr.marker.format.fill.fore_color.rgb = rgb(c)
            sr.format.line.fill.background()

    # 4 universities
    u = D.unis(lvl, area).head(12)
    s = deck.body("Part 2 · universities", f"Universities in {area}", f"Largest universities by BCI, {y}",
                  panel=(str(int(t.loc[area, "n"])), f"universities reporting in {y}", f"{int(t.loc[area,'spin']) if pd.notna(t.loc[area,'spin']) else 0} surviving spin-outs (3+ years, CPM definition)."))
    rows = [[r.he_provider[:46], (r.cluster.split(" (")[0] if isinstance(r.cluster, str) else "–")[:34], gbp(r.bci_total), "–" if pd.isna(r.n_spinouts_surv3) else int(r.n_spinouts_surv3)] for r in u.itertuples()]
    table(deck, s, ["University", "BCI portfolio group", "BCI", "Spin-outs"], rows, [3300000, 2500000, 1000000, 900000])

    # 5 local economy
    if lvl == "ttwa" and area in D.ttwa_ctx.index:
        c = D.ttwa_ctx.loc[area]
        allc = D.ttwa_ctx
        def pc(col, mult=1):
            v = c[col]
            return "–" if pd.isna(v) else f"{v*mult:,.0f}"
        rows = [["Type of local economy", str(c.ttwa_type), "–"],
                ["Knowledge-intensive jobs (% of employment)", pc("ttwa_ki_share", 100), f"{allc.ttwa_ki_share.median()*100:.0f}"],
                ["GVA per filled job, 2023 (£)", pc("ttwa_gva_per_job_2023"), f"{allc.ttwa_gva_per_job_2023.median():,.0f}"],
                ["Employee jobs (BRES 2024)", pc("ttwa_jobs_bres2024"), f"{allc.ttwa_jobs_bres2024.median():,.0f}"],
                ["Composite place score (percentile)", pc("ttwa_composite_pct"), "50"],
                ["Industrial-legacy employment share (%)", pc("ttwa_legacy_share", 100), f"{allc.ttwa_legacy_share.median()*100:.0f}"]]
        s = deck.body("Part 2 · local economy", f"The local economy around {area}", "Selected local-economy measures against the median university TTWA",
                      panel=(str(c.ttwa_type)[:26], "type of local economy", "From NCUB's five-way TTWA typology (productivity, knowledge intensity and industrial legacy)."))
        table(deck, s, ["Measure", area[:20], "Median"], rows, [4300000, 1900000, 1500000])
    else:
        col = {"itl1": "a_itl1", "itl2": "a_itl2"}[lvl]
        x = D.d[(D.d[col] == area) & (D.d.academic_year == y)]
        tt = x.groupby("ttwa_name")["bci_total"].sum().sort_values(ascending=False).head(10)
        s = deck.body("Part 2 · travel-to-work areas", f"Where the income sits inside {area}", f"BCI by travel-to-work area, £m, {y}",
                      panel=(str(x["ttwa_name"].nunique()), "travel-to-work areas with a university", "Universities without a campus TTWA in the panel are not shown."))
        if len(tt):
            bar_chart(deck, s, [n[:34] for n in tt.index], [round(v / 1000, 1) for v in tt.values], [PNK] * len(tt), fmt='"£"#,##0.0"m"', series="BCI £m")
    deck.save(path)


def build_uk_deck(D, path):
    y = YEARS[D.ty]
    deck = Deck()
    deck.cover("Where university–business collaboration happens",
               "ITL1 regions, ITL2 sub-regions and travel-to-work areas", f"Collaboration Progress Monitor · {y} · {date_str()}")
    uk = D.uk_all.loc[y]
    # findings
    ins = []
    for lvl in ("itl1", "itl2", "ttwa"):
        t = D.tab[(lvl, "all")].xs(y, level=1)["bci"].sort_values(ascending=False)
        c = t.cumsum() / uk.bci
        half = int((c < .5).sum()) + 1
        ins.append((f"Concentration by {LVL_TXT[lvl]}", f"{t.index[0]} leads with {gbp(t.iloc[0])} ({t.iloc[0]/uk.bci*100:.0f}% of UK BCI). {half} of {len(t)} {LVL_TXT[lvl]}s account for half of the UK total of {gbp(uk.bci)}."))
    tt = D.tab[("ttwa", "all")].xs(y, level=1)
    ctx = D.ttwa_ctx.reindex(tt.index)
    per = tt["bci"] * 1000 / ctx.ttwa_jobs_bres2024
    ok = per.notna() & ctx.ttwa_ki_share.notna()
    rho = pd.Series(per[ok]).rank().corr(ctx.ttwa_ki_share[ok].rank())
    ins.append(("Place and economy", f"Across {ok.sum()} university towns and cities, BCI per local job and knowledge-intensive employment share have a rank correlation of {rho:.2f}."))
    grp = tt.groupby(ctx.ttwa_type)["bci"].sum().sort_values(ascending=False)
    jobs = ctx.groupby("ttwa_type")["ttwa_jobs_bres2024"].sum()
    k = grp.index[0]
    ins.append(("Types of local economy", f"{k} hold {grp.iloc[0]/grp.sum()*100:.0f}% of BCI but {jobs[k]/jobs.sum()*100:.0f}% of jobs in university TTWAs."))
    findings_slide(deck, "Where collaboration happens: key findings", ins)
    for lvl, n in (("itl1", 12), ("itl2", 15), ("ttwa", 15)):
        t = D.tab[(lvl, "all")].xs(y, level=1)["bci"].sort_values(ascending=False)
        top = t.head(n)
        cols = [REG_COL.get(D.region_of(lvl, a) or "", MID) for a in top.index] if lvl != "itl1" else [REG_COL.get(a, MID) for a in top.index]
        s = deck.body(f"Place · {LVL_TXT[lvl]}s", f"{top.index[0]} leads business collaboration income",
                      f"Business collaboration income, £m, {y}",
                      panel=(gbp(top.iloc[0]), f"{top.index[0]}", f"{top.iloc[0]/uk.bci*100:.0f}% of the UK total of {gbp(uk.bci)}; top three hold {top.iloc[:3].sum()/uk.bci*100:.0f}%. Bars coloured by ITL1 region."))
        bar_chart(deck, s, [(a if len(a) < 38 else a[:36] + "…") for a in top.index], [round(v / 1000, 1) for v in top.values], cols, fmt='"£"#,##0.0"m"', series="BCI £m")
    # location quotient (ITL2 top share)
    t2 = D.tab[("itl2", "all")].xs(y, level=1)
    lq = ((t2.bci / uk.bci) / (t2.acad / uk.acad)).where(t2.bci / uk.bci >= .01).dropna().sort_values(ascending=False)
    pick = list(lq.index[:7]) + list(lq.index[-5:])
    s = deck.body("Place · weight", "Some places punch above their academic weight", f"Location quotient by ITL2 sub-region, {y} (areas with ≥1% of UK BCI)",
                  panel=(f"{lq.iloc[0]:.1f}×", f"{lq.index[0]}", "Location quotient = share of UK BCI ÷ share of UK academic staff. Above 1 means more BCI than academic size predicts."))
    bar_chart(deck, s, [a[:38] for a in pick], [round(float(lq[a]), 2) for a in pick], [PNK if lq[a] >= 1 else MID for a in pick], fmt='0.0"×"', series="LQ")
    # scatter place & economy
    xs = XyChartData()
    ser_ = xs.add_series("University TTWAs")
    for a in tt.index[ok.reindex(tt.index).fillna(False)]:
        ser_.add_data_point(float(ctx.loc[a, "ttwa_ki_share"] * 100), float(per[a]))
    s = deck.body("Part 2 · local economy", "Collaboration income per local job vs knowledge-intensive employment",
                  f"BCI per job (£) against knowledge-intensive employment share (%), {y}",
                  panel=(f"ρ = {rho:.2f}", "rank correlation", "Each point is a travel-to-work area with a university. Income is recorded where the university is based, not where partners are."))
    gf = s.shapes.add_chart(XL_CHART_TYPE.XY_SCATTER, *[Emu(v) for v in CH], xs)
    ch = gf.chart; style_chart(ch, legend=False)
    ch.value_axis.major_gridlines.format.line.color.rgb = rgb("EEEBF1")
    for sr in ch.plots[0].series:
        sr.marker.format.fill.solid(); sr.marker.format.fill.fore_color.rgb = rgb(PNK)
        sr.format.line.fill.background()
    # typology
    ts = list(grp.index)
    s = deck.body("Place · types of local economy", "Where the income sits by type of local economy", f"Share of BCI and share of jobs by TTWA type, {y}",
                  panel=(f"{grp.iloc[0]/grp.sum()*100:.0f}%", f"of BCI in {k}", f"…against {jobs[k]/jobs.sum()*100:.0f}% of jobs in university TTWAs."))
    cd = CategoryChartData(); cd.categories = [str(a) for a in ts]
    cd.add_series("Share of BCI", [round(float(grp[a] / grp.sum() * 100), 1) for a in ts])
    cd.add_series("Share of jobs", [round(float(jobs[a] / jobs.sum() * 100), 1) for a in ts])
    gf = s.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, *[Emu(v) for v in CH], cd)
    ch = gf.chart; style_chart(ch)
    ch.value_axis.major_gridlines.format.line.color.rgb = rgb("EEEBF1")
    for sr, c in zip(ch.plots[0].series, [PNK, "AAA5BB"]):
        sr.format.fill.solid(); sr.format.fill.fore_color.rgb = rgb(c)
    deck.save(path)


def slug(s):
    return re.sub(r"[^A-Za-z0-9]+", "_", s).strip("_")


def main():
    only = None
    if "--only" in sys.argv:
        only = sys.argv[sys.argv.index("--only") + 1].lower()
    D = Data()
    n = 0
    for lvl in ("itl1", "itl2", "ttwa"):
        if only not in (None, lvl):
            continue
        for a in D.areas(lvl):
            build_area_deck(D, lvl, a, os.path.join(OUT, lvl.upper(), f"{slug(a)}.pptx")); n += 1
    print(f"[OK] {n} PowerPoint reports written to {OUT}")


if __name__ == "__main__":
    main()
