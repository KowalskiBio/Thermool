"""Generates Thermool's animated README art (hero banner, pipeline) in
light and dark variants.

    python docs/assets/make_art.py docs/assets
"""
import math
import sys
from pathlib import Path

OUT = Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)

THEMES = {
    "light": dict(bg="#fbfbfc", bg2="#f3f3f5", border="#e4e4e8", grid="#dedee3", ink="#18181b", muted="#5c5c66", faint="#9a9aa3",
                  accent="#1f4fd1", accent_soft="#dfe6fb", idt="#0f7a6c", idt_soft="#dcefeb", curve="#cfd0d6", chip="#ffffff", glow="#1f4fd1"),
    "dark": dict(bg="#0f1013", bg2="#15161a", border="#26272d", grid="#1f2026", ink="#ececf0", muted="#a3a3ad", faint="#6b6b75",
                 accent="#86a6f8", accent_soft="#1c2644", idt="#55cab7", idt_soft="#123029", curve="#383943", chip="#17181c", glow="#86a6f8"),
}
NT = {"A": "#F2A65A", "T": "#6FA8DC", "C": "#89C997", "G": "#E8786F"}
SANS = "'IBM Plex Sans','Inter','Segoe UI',Helvetica,Arial,sans-serif"
MONO = "'IBM Plex Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace"


def hero(t):
    W, H = 1280, 420
    seq = "GCACTACAACCGCTACCGTG"
    parts = []
    a = parts.append
    a(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-label="Thermool: oligo thermodynamics with Strider, compared side by side with IDT OligoAnalyzer">')
    a(f'''<defs>
  <pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="1.2" cy="1.2" r="1.2" fill="{t['grid']}"/></pattern>
  <radialGradient id="halo" cx="0.66" cy="0.5" r="0.55"><stop offset="0" stop-color="{t['glow']}" stop-opacity="0.13"/><stop offset="1" stop-color="{t['glow']}" stop-opacity="0"/></radialGradient>
  <linearGradient id="fade" x1="0" x2="1"><stop offset="0" stop-color="{t['bg']}" stop-opacity="1"/><stop offset="0.42" stop-color="{t['bg']}" stop-opacity="0.85"/><stop offset="1" stop-color="{t['bg']}" stop-opacity="0"/></linearGradient>
  <clipPath id="card"><rect x="1" y="1" width="{W-2}" height="{H-2}" rx="22"/></clipPath>
</defs>
<style>
  .type {{ opacity: 0; animation: type 9s infinite both; }}
  @keyframes type {{ 0% {{ opacity: 0 }} 2% {{ opacity: 1 }} 86% {{ opacity: 1 }} 92%, 100% {{ opacity: 0 }} }}
  .chip {{ opacity: 0; animation: chip 9s infinite both; }}
  @keyframes chip {{ 0%, 22% {{ opacity: 0; transform: translateY(6px) }} 27% {{ opacity: 1; transform: translateY(0) }} 86% {{ opacity: 1 }} 92%, 100% {{ opacity: 0 }} }}
  .rung {{ opacity: 0; animation: rung 9s infinite both; }}
  @keyframes rung {{ 0% {{ opacity: 0 }} 3% {{ opacity: 1 }} 50% {{ opacity: 1 }} 54%, 100% {{ opacity: 0 }} }}
  .draw {{ stroke-dasharray: 100; stroke-dashoffset: 100; animation: draw 9s infinite linear both; }}
  @keyframes draw {{ 0%, 18% {{ stroke-dashoffset: 100 }} 40% {{ stroke-dashoffset: 62 }} 60% {{ stroke-dashoffset: 24 }} 82%, 92% {{ stroke-dashoffset: 0 }} 100% {{ stroke-dashoffset: 0; opacity: 0 }} }}
  .tm {{ animation: tm 9s infinite both; }}
  @keyframes tm {{ 0%, 44% {{ opacity: 0.35 }} 50%, 62% {{ opacity: 1 }} 72%, 100% {{ opacity: 0.35 }} }}
  .caret {{ animation: caret 1s steps(1) infinite; }}
  @keyframes caret {{ 50% {{ opacity: 0 }} }}
  .pulse {{ animation: pulse 3s ease-in-out infinite; transform-origin: 1120px 74px; }}
  @keyframes pulse {{ 0%, 100% {{ opacity: 0.55 }} 50% {{ opacity: 1 }} }}
  @media (prefers-reduced-motion: reduce) {{ .type, .chip, .rung, .draw, .tm, .caret, .pulse {{ animation: none; opacity: 1; stroke-dashoffset: 0; }} }}
</style>''')
    a(f'<g clip-path="url(#card)"><rect width="{W}" height="{H}" fill="{t["bg"]}"/><rect width="{W}" height="{H}" fill="url(#dots)"/><rect width="{W}" height="{H}" fill="url(#halo)"/><rect width="700" height="{H}" fill="url(#fade)"/></g>')
    a(f'<rect x="1" y="1" width="{W-2}" height="{H-2}" rx="22" fill="none" stroke="{t["border"]}" stroke-width="1.5"/>')

    # Left: wordmark, tagline, typed oligo, value chips.
    x0 = 72
    a(f'<text x="{x0}" y="92" font-family="{MONO}" font-size="13" letter-spacing="3" fill="{t["accent"]}">STRIDER  ·  IDT OLIGOANALYZER  ·  RUST</text>')
    a(f'<text x="{x0-3}" y="168" font-family="{SANS}" font-size="78" font-weight="600" letter-spacing="-2.5" fill="{t["ink"]}">Thermool</text>')
    a(f'<text x="{x0}" y="210" font-family="{SANS}" font-size="22" fill="{t["muted"]}">Oligo thermodynamics, side by side with IDT.</text>')
    # Typed sequence.
    cw = 13.25
    y = 262
    a(f'<text x="{x0}" y="{y}" font-family="{MONO}" font-size="21" fill="{t["faint"]}">5′</text>')
    for i, b in enumerate(seq):
        a(f'<text class="type" style="animation-delay:{0.08 * i:.2f}s" x="{x0 + 34 + i * cw:.1f}" y="{y}" font-family="{MONO}" font-size="21" font-weight="500" fill="{NT[b]}">{b}</text>')
    xe = x0 + 34 + len(seq) * cw
    a(f'<text class="type" style="animation-delay:{0.08 * len(seq):.2f}s" x="{xe + 6:.1f}" y="{y}" font-family="{MONO}" font-size="21" fill="{t["faint"]}">3′</text>')
    # Chips: Strider's real numbers for this oligo (qPCR conditions, Mathews).
    chips = [("Tm", "67.6 °C"), ("GC", "60.0 %"), ("Hairpin ΔG", "-0.60 kcal/mol")]
    cx = x0
    for k, (label, val) in enumerate(chips):
        w = 34 + len(label) * 7.6 + 10 + len(val) * 9.2
        a(f'<g class="chip" style="animation-delay:{0.12 * k:.2f}s">')
        a(f'<rect x="{cx}" y="290" width="{w:.0f}" height="40" rx="20" fill="{t["chip"]}" stroke="{t["border"]}"/>')
        a(f'<text x="{cx + 17}" y="315" font-family="{SANS}" font-size="14" fill="{t["muted"]}">{label}<tspan dx="9" font-family="{MONO}" font-size="15" font-weight="500" fill="{t["ink"]}">{val}</tspan></text>')
        a('</g>')
        cx += w + 10
    a(f'<text x="{x0}" y="368" font-family="{SANS}" font-size="13.5" fill="{t["faint"]}">Strider values for this oligo at 50 mM Na⁺, 3 mM Mg²⁺, 0.8 mM dNTPs, 0.2 µM.</text>')

    # Middle: hairpin that zips up and melts.
    cxh, cyh, r = 800, 150, 36
    L, R = cxh - 23, cxh + 23
    ys = [176 + 28 * k for k in range(6)][::-1]  # bottom -> top
    left = "GCGCAC"   # 5' end at the bottom
    loop = "GAAA"
    right_bt = "CGCGTG"  # bottom -> top on the right strand
    pts = [(L, ys[k], left[k]) for k in range(6)]
    for k, base in enumerate(loop):
        ang = math.radians(186 + 56 * k)
        pts.append((cxh + r * math.cos(ang), cyh + r * math.sin(ang), base))
    pts += [(R, ys[k], right_bt[k]) for k in range(5, -1, -1)]
    a(f'<polyline points="{" ".join(f"{x:.1f},{y:.1f}" for x, y, _ in pts)}" fill="none" stroke="{t["faint"]}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" opacity="0.8"/>')
    for k in range(6):
        a(f'<line class="rung" style="animation-delay:{0.22 * k:.2f}s" x1="{L + 12}" y1="{ys[k]}" x2="{R - 12}" y2="{ys[k]}" stroke="{t["accent"]}" stroke-width="3" stroke-linecap="round"/>')
    for x, y, base in pts:
        a(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="12" fill="{NT[base]}" stroke="{t["bg"]}" stroke-width="2"/>')
        a(f'<text x="{x:.1f}" y="{y + 4.6:.1f}" text-anchor="middle" font-family="{SANS}" font-size="12.5" font-weight="700" fill="#ffffff">{base}</text>')
    a(f'<text x="{L}" y="{ys[0] + 34}" text-anchor="middle" font-family="{MONO}" font-size="13" fill="{t["faint"]}">5′</text>')
    a(f'<text x="{R}" y="{ys[0] + 34}" text-anchor="middle" font-family="{MONO}" font-size="13" fill="{t["faint"]}">3′</text>')

    # Right: melting curve with a marker riding it, Tm line.
    px0, px1, py0, py1 = 940, 1210, 120, 320
    a(f'<rect x="{px0 - 26}" y="{py0 - 56}" width="{px1 - px0 + 52}" height="{py1 - py0 + 104}" rx="16" fill="{t["bg2"]}" stroke="{t["border"]}"/>')
    a(f'<text x="{px0 - 6}" y="{py0 - 28}" font-family="{SANS}" font-size="13" font-weight="600" fill="{t["ink"]}">Fraction folded</text>')
    a(f'<g class="pulse"><circle cx="1120" cy="74" r="4" fill="{t["idt"]}"/></g><text x="1130" y="79" font-family="{MONO}" font-size="12" fill="{t["idt"]}">live</text>')
    for g in range(5):
        gy = py0 + g * (py1 - py0) / 4
        a(f'<line x1="{px0}" y1="{gy:.1f}" x2="{px1}" y2="{gy:.1f}" stroke="{t["border"]}" stroke-width="1"/>')
    def curve_pt(u):
        x = px0 + u * (px1 - px0)
        f = 1 / (1 + math.exp((u - 0.55) * 14))
        return x, py1 - f * (py1 - py0)
    d = "M " + " L ".join(f"{x:.1f},{y:.1f}" for x, y in (curve_pt(i / 60) for i in range(61)))
    a(f'<path d="{d}" fill="none" stroke="{t["curve"]}" stroke-width="3" stroke-linecap="round"/>')
    a(f'<path class="draw" pathLength="100" d="{d}" fill="none" stroke="{t["accent"]}" stroke-width="3.5" stroke-linecap="round"/>')
    tmx = px0 + 0.55 * (px1 - px0)
    a(f'<g class="tm"><line x1="{tmx:.1f}" y1="{py0 - 6}" x2="{tmx:.1f}" y2="{py1 + 6}" stroke="{t["idt"]}" stroke-width="1.6" stroke-dasharray="4 4"/>'
      f'<text x="{tmx + 7:.1f}" y="{py0 + 12}" font-family="{MONO}" font-size="13" font-weight="600" fill="{t["idt"]}">Tm</text></g>')
    a(f'<circle r="6.5" fill="{t["accent"]}" stroke="{t["bg2"]}" stroke-width="2.5"><animateMotion dur="9s" repeatCount="indefinite" path="{d}" keyPoints="0;0;0.38;0.76;1;1" keyTimes="0;0.18;0.4;0.6;0.82;1" calcMode="linear"/></circle>')
    a(f'<text x="{px0}" y="{py1 + 30}" font-family="{SANS}" font-size="12.5" fill="{t["faint"]}">cold</text>')
    a(f'<text x="{px1}" y="{py1 + 30}" text-anchor="end" font-family="{SANS}" font-size="12.5" fill="{t["faint"]}">hot</text>')
    a('</svg>')
    return "\n".join(parts)


def pipeline(t):
    W, H = 1280, 300
    p = []
    a = p.append
    a(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-label="How Thermool works: your oligo goes to Strider in Rust; on request each analysis also goes to IDT OligoAnalyzer; both appear side by side">')
    a(f'''<style>
  .flow {{ stroke-dasharray: 7 9; animation: flow 1.1s linear infinite; }}
  .flow.slow {{ animation-duration: 1.8s; }}
  @keyframes flow {{ to {{ stroke-dashoffset: -16; }} }}
  .glow {{ animation: glow 2.6s ease-in-out infinite; }}
  @keyframes glow {{ 0%, 100% {{ opacity: 0.35 }} 50% {{ opacity: 1 }} }}
  @media (prefers-reduced-motion: reduce) {{ .flow, .glow {{ animation: none; }} }}
</style>''')
    a(f'<rect x="1" y="1" width="{W-2}" height="{H-2}" rx="20" fill="{t["bg"]}" stroke="{t["border"]}" stroke-width="1.5"/>')

    def node(x, y, w, h, title, lines, color, soft, tag=None):
        a(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="14" fill="{t["chip"]}" stroke="{color}" stroke-width="1.6"/>')
        a(f'<rect x="{x}" y="{y}" width="6" height="{h}" rx="3" fill="{color}"/>')
        a(f'<text x="{x + 24}" y="{y + 34}" font-family="{SANS}" font-size="17" font-weight="600" fill="{t["ink"]}">{title}</text>')
        if tag:
            tw = len(tag) * 7.6 + 18
            a(f'<rect x="{x + w - tw - 14}" y="{y + 17}" width="{tw:.0f}" height="22" rx="11" fill="{soft}"/>')
            a(f'<text x="{x + w - tw / 2 - 14:.0f}" y="{y + 32}" text-anchor="middle" font-family="{MONO}" font-size="11.5" fill="{color}">{tag}</text>')
        for k, line in enumerate(lines):
            a(f'<text x="{x + 24}" y="{y + 60 + k * 21}" font-family="{SANS}" font-size="13.5" fill="{t["muted"]}">{line}</text>')

    node(40, 40, 300, 124, "Your oligo", ["5′ to 3′, raw or FASTA", "optional partner strand", "Na⁺ · Mg²⁺ · dNTPs · oligo"], t["faint"], t["bg2"], "paste")
    node(470, 40, 340, 124, "Strider engine", ["Tm, GC, duplex ΔG / ΔH / ΔS", "5 ranked hairpins and dimers", "Mathews 2004 or SantaLucia 2004"], t["accent"], t["accent_soft"], "Rust")
    node(940, 40, 300, 124, "Side by side", ["Strider next to IDT", "matched structure by structure", "light and dark, any screen"], t["ink"], t["bg2"], "UI")
    node(470, 196, 340, 82, "IDT OligoAnalyzer", ["your account, on demand, via proxy"], t["idt"], t["idt_soft"], "optional")

    a(f'<line class="flow" x1="345" y1="102" x2="462" y2="102" stroke="{t["accent"]}" stroke-width="2.4"/>')
    a(f'<path d="M 456 96 L 464 102 L 456 108" fill="none" stroke="{t["accent"]}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>')
    a(f'<line class="flow" x1="815" y1="102" x2="932" y2="102" stroke="{t["accent"]}" stroke-width="2.4"/>')
    a(f'<path d="M 926 96 L 934 102 L 926 108" fill="none" stroke="{t["accent"]}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>')
    a(f'<path class="flow slow" d="M 815 237 L 1090 237 L 1090 172" fill="none" stroke="{t["idt"]}" stroke-width="2.4"/>')
    a(f'<path d="M 1084 178 L 1090 170 L 1096 178" fill="none" stroke="{t["idt"]}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>')
    a(f'<path class="flow slow" d="M 190 164 L 190 237 L 462 237" fill="none" stroke="{t["idt"]}" stroke-width="2.4" opacity="0.7"/>')
    a(f'<path d="M 456 231 L 464 237 L 456 243" fill="none" stroke="{t["idt"]}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" opacity="0.7"/>')
    a(f'<circle class="glow" cx="1090" cy="237" r="5" fill="{t["idt"]}"/>')
    a(f'<text x="1104" y="262" font-family="{SANS}" font-size="12.5" fill="{t["faint"]}">same conditions</text>')
    a('</svg>')
    return "\n".join(p)


for name, t in THEMES.items():
    (OUT / f"hero-{name}.svg").write_text(hero(t))
    (OUT / f"pipeline-{name}.svg").write_text(pipeline(t))
print("ok")
