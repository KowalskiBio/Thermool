/** Secondary-structure element of every base, ported from Strider's
 * `strider.viz.geometry.element_types` (the classification behind its
 * `color="structure"` figures, Oligool's "Structure" colour mode).
 *
 * Paired bases are "stem". An unpaired base takes the type of the loop it
 * sits in, by how many helices branch off that loop: none is a "hairpin"
 * loop, one an "interior" loop or bulge, two or more a "multiloop". Bases
 * outside every pair are "exterior".
 *
 * One deliberate difference from Strider: in a dimer (two strands joined at
 * `nick`) a loop that contains the strand break is open, so its bases are
 * "exterior" (the dangling ends). Strider ignores the break when typing and
 * calls them "hairpin", which a dimer does not have. Everything else matches
 * `element_types` exactly. */

export type Element = 'stem' | 'hairpin' | 'interior' | 'multiloop' | 'exterior';

/** Strider's element palette (`strider.viz.style.ELEMENT_COLORS`). */
export const ELEMENT_COLORS: Record<Element, string> = {
  stem: '#6FA8DC',
  hairpin: '#F2A65A',
  interior: '#89C997',
  multiloop: '#C39BD3',
  exterior: '#6FD4C8',
};

export const ELEMENT_LABELS: [Element, string][] = [
  ['stem', 'Stem'],
  ['hairpin', 'Hairpin loop'],
  ['interior', 'Interior loop / bulge'],
  ['multiloop', 'Multiloop'],
  ['exterior', 'Exterior / dangling'],
];

/** `dotBracket` covers every base (for a dimer, seq1 + seq2 with no
 * separator); `nick` is where strand 2 starts. */
export function elementTypes(dotBracket: string, nick?: number): Element[] {
  const n = dotBracket.length;
  const partner = new Array<number>(n).fill(-1);
  const stack: number[] = [];
  for (let k = 0; k < n; k++) {
    if (dotBracket[k] === '(') stack.push(k);
    else if (dotBracket[k] === ')') {
      const a = stack.pop();
      if (a !== undefined) {
        partner[a] = k;
        partner[k] = a;
      }
    }
  }
  const types = new Array<Element>(n).fill('exterior');

  // Walks the loop closed by (i, j), or the exterior loop for i = -1.
  const visit = (i: number, j: number) => {
    const unpaired: number[] = [];
    let helices = 0;
    let open = i < 0; // exterior, or a loop containing the strand break
    let k = i + 1;
    while (k < j) {
      if (k === nick) open = true;
      if (partner[k] > k) {
        helices++;
        types[k] = types[partner[k]] = 'stem';
        visit(k, partner[k]);
        k = partner[k] + 1;
      } else {
        unpaired.push(k);
        k++;
      }
    }
    if (j === nick) open = true;
    const kind: Element = open ? 'exterior' : helices === 0 ? 'hairpin' : helices === 1 ? 'interior' : 'multiloop';
    for (const u of unpaired) types[u] = kind;
  };
  visit(-1, n);
  return types;
}
