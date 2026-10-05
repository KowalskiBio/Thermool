/**
 * A bimolecular dimer drawn as a duplex, in Strider's figure style (the
 * palette, backbone and rungs of `StriderStructure`): strand 1 on top,
 * 5' to 3' left to right; strand 2 underneath, 3' to 5', so paired bases
 * sit in the same column joined by a rung.
 *
 * Layout: unpaired flanks hang opposite each other as overhangs (dangling
 * ends) instead of being spread out with gap columns, and a bulge or
 * interior loop takes as many columns as its longer side. Drawn at one
 * fixed scale, so bases are the same size in every card.
 */
import { openSvgInNewTab } from '../lib/openSvgTab';

interface Props {
  seq1: string;
  seq2: string;
  /** Dot-bracket over `seq1 + seq2` (no separator). */
  structure: string;
  title?: string;
}

// Strider's palette (`strider.viz.style`), as in `StriderStructure`.
const NT: Record<string, string> = { A: '#F2A65A', T: '#6FA8DC', U: '#6FA8DC', C: '#89C997', G: '#E8786F' };
const BACKBONE = '#8c8c8c';
const RUNG = '#c4c4c4';
const BALL_EDGE = '#333333';

const STEP = 21; // px per column
const R = 9; // ball radius
const ROW_GAP = 44; // between strand centres
const PAD_X = 30; // room for 5'/3' labels
const PAD_Y = 14;

const WOBBLE = new Set(['GT', 'TG', 'GU', 'UG']);

interface Layout {
  top: number[]; // column of each seq1 base
  bottom: number[]; // column of each seq2 base (by seq2 index)
  pairs: [number, number][]; // [seq1 index, seq2 index]
  cols: number;
}

/** Inter-strand pairs from a dot-bracket over seq1 + seq2. */
function interPairs(structure: string, n1: number): [number, number][] {
  const stack: number[] = [];
  const out: [number, number][] = [];
  for (let k = 0; k < structure.length; k++) {
    if (structure[k] === '(') stack.push(k);
    else if (structure[k] === ')') {
      const a = stack.pop();
      if (a !== undefined && a < n1 && k >= n1) out.push([a, k - n1]);
    }
  }
  return out.sort((x, y) => x[0] - y[0]);
}

function layout(n1: number, n2: number, pairs: [number, number][]): Layout {
  // Bottom strand is shown 3' to 5': display index d = n2 - 1 - j.
  const d = (j: number) => n2 - 1 - j;
  const top = new Array<number>(n1).fill(0);
  const bot = new Array<number>(n2).fill(0); // by display index
  const [i0, j0] = pairs[0];
  // The first pair's column leaves room for both left overhangs.
  let col = Math.max(i0, d(j0));
  for (let i = 0; i <= i0; i++) top[i] = col - (i0 - i);
  for (let k = 0; k <= d(j0); k++) bot[k] = col - (d(j0) - k);
  for (let p = 1; p < pairs.length; p++) {
    const [ia, ja] = pairs[p - 1];
    const [ib, jb] = pairs[p];
    const nt = ib - ia; // steps on top, including the paired base
    const nb = d(jb) - d(ja);
    const span = Math.max(nt, nb);
    for (let s = 1; s < nt; s++) top[ia + s] = col + s;
    for (let s = 1; s < nb; s++) bot[d(ja) + s] = col + s;
    col += span;
    top[ib] = col;
    bot[d(jb)] = col;
  }
  const [il, jl] = pairs[pairs.length - 1];
  for (let i = il + 1; i < n1; i++) top[i] = col + (i - il);
  for (let k = d(jl) + 1; k < n2; k++) bot[k] = col + (k - d(jl));
  const bottom = Array.from({ length: n2 }, (_, j) => bot[d(j)]);
  const cols = Math.max(...top, ...bottom) + 1;
  return { top, bottom, pairs, cols };
}

/** Overhang bases kept next to the paired region; longer ends collapse to "+N". */
const FLANK = 4;

export default function DuplexSvg({ seq1, seq2, structure, title = 'Dimer' }: Props) {
  const s1 = seq1.toUpperCase();
  const s2 = seq2.toUpperCase();
  const pairs = interPairs(structure, s1.length);
  if (pairs.length === 0 || structure.length !== s1.length + s2.length) {
    return <p className="py-2 text-[12px] italic text-ink-faint">No inter-strand base pairs</p>;
  }
  const n1 = s1.length;
  const n2 = s2.length;
  const L = layout(n1, n2, pairs);

  // Visible ranges, each in its strand's left-to-right display order.
  // Top: seq1 indices. Bottom: display index d = n2 - 1 - j (3' to 5').
  // Collapsing only one or two bases saves nothing; draw them instead.
  const lo = (v: number) => (v <= 2 ? 0 : v);
  const hi = (v: number, n: number) => (n - 1 - v <= 2 ? n - 1 : v);
  const topLo = lo(Math.max(0, pairs[0][0] - FLANK));
  const topHi = hi(Math.min(n1 - 1, pairs[pairs.length - 1][0] + FLANK), n1);
  const dFirst = n2 - 1 - pairs[0][1];
  const dLast = n2 - 1 - pairs[pairs.length - 1][1];
  const botLo = lo(Math.max(0, dFirst - FLANK));
  const botHi = hi(Math.min(n2 - 1, dLast + FLANK), n2);
  const topCols = s1.split('').map((_, i) => L.top[i]);
  const botColsByD = Array.from({ length: n2 }, (_, d) => L.bottom[n2 - 1 - d]);
  const hidden = { topL: topLo, topR: n1 - 1 - topHi, botL: botLo, botR: n2 - 1 - botHi };

  const minCol = Math.min(topCols[topLo], botColsByD[botLo]);
  const maxCol = Math.max(topCols[topHi], botColsByD[botHi]);
  const leftExtra = hidden.topL || hidden.botL ? 1.6 : 0;
  const rightExtra = hidden.topR || hidden.botR ? 1.6 : 0;
  const W = PAD_X * 2 + (maxCol - minCol + leftExtra + rightExtra) * STEP;
  const H = PAD_Y * 2 + ROW_GAP + 2 * R;
  const yTop = PAD_Y + R;
  const yBot = yTop + ROW_GAP;
  const x = (c: number) => PAD_X + (c - minCol + leftExtra) * STEP;

  // One strand: backbone, balls, a "+N" stub for collapsed ends, end labels.
  const strand = (seq: string, cols: number[], lo: number, hi: number, hideL: number, hideR: number, y: number, ends: [string, string], key: string) => {
    const els: React.ReactElement[] = [];
    for (let k = lo; k < hi; k++) els.push(<line key={`${key}bb${k}`} x1={x(cols[k])} y1={y} x2={x(cols[k + 1])} y2={y} stroke={BACKBONE} strokeWidth={1.8} strokeLinecap="round" />);
    let leftX = x(cols[lo]) - R;
    let rightX = x(cols[hi]) + R;
    if (hideL) {
      const sx = x(cols[lo]) - 1.6 * STEP;
      els.push(<line key={`${key}sl`} x1={sx + 4} y1={y} x2={x(cols[lo])} y2={y} stroke={BACKBONE} strokeWidth={1.8} strokeDasharray="2 3" />);
      els.push(<text key={`${key}nl`} x={sx} y={y} textAnchor="end" dominantBaseline="central" fontSize={10} fill="var(--ink-faint, #999)">{`+${hideL}`}</text>);
      leftX = sx - 6 * String(hideL).length - 8;
    }
    if (hideR) {
      const sx = x(cols[hi]) + 1.6 * STEP;
      els.push(<line key={`${key}sr`} x1={x(cols[hi])} y1={y} x2={sx - 4} y2={y} stroke={BACKBONE} strokeWidth={1.8} strokeDasharray="2 3" />);
      els.push(<text key={`${key}nr`} x={sx} y={y} textAnchor="start" dominantBaseline="central" fontSize={10} fill="var(--ink-faint, #999)">{`+${hideR}`}</text>);
      rightX = sx + 6 * String(hideR).length + 8;
    }
    for (let k = lo; k <= hi; k++) {
      els.push(
        <g key={`${key}b${k}`}>
          <circle cx={x(cols[k])} cy={y} r={R} fill={NT[seq[k]] ?? 'gray'} stroke={BALL_EDGE} strokeWidth={0.6} />
          <text x={x(cols[k])} y={y} textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700} fill="#ffffff">
            {seq[k]}
          </text>
        </g>,
      );
    }
    const label = (txt: string, xx: number, anchor: 'end' | 'start') => (
      <text key={`${key}${txt}${anchor}`} x={xx} y={y} textAnchor={anchor} dominantBaseline="central" fontSize={11} fontWeight={600} fill="var(--ink-muted, #555)">
        {txt}
      </text>
    );
    els.push(label(ends[0], leftX - 5, 'end'), label(ends[1], rightX + 5, 'start'));
    return els;
  };

  // Bottom strand in display order (3' to 5'), so the generic strand drawer applies.
  const s2Display = [...s2].reverse().join('');
  const leftPad = Math.max(hidden.topL, hidden.botL) ? 22 : 0;
  const rightPad = Math.max(hidden.topR, hidden.botR) ? 22 : 0;

  return (
    <svg
      viewBox={`${-leftPad} 0 ${W + leftPad + rightPad} ${H}`}
      width={W + leftPad + rightPad}
      height={H}
      style={{ maxWidth: '100%', height: 'auto' }}
      className="mx-auto block cursor-zoom-in"
      role="button"
      aria-label="Open structure in a new tab"
      onClick={(e) => openSvgInNewTab(e.currentTarget, title)}
      fontFamily="'DejaVu Sans', Arial, Helvetica, sans-serif"
    >
      <title>Click to open in a new tab</title>
      {L.pairs.map(([i, j]) => {
        const wobble = WOBBLE.has(s1[i] + s2[j]);
        return <line key={`r${i}`} x1={x(L.top[i])} y1={yTop + R + 1} x2={x(L.bottom[j])} y2={yBot - R - 1} stroke={RUNG} strokeWidth={2.4} strokeDasharray={wobble ? '3 3' : undefined} />;
      })}
      {strand(s1, topCols, topLo, topHi, hidden.topL, hidden.topR, yTop, ["5'", "3'"], 't')}
      {strand(s2Display, botColsByD, botLo, botHi, hidden.botL, hidden.botR, yBot, ["3'", "5'"], 'b')}
    </svg>
  );
}
