/**
 * Tailwind utilities on one element that set the same CSS property under the same variant.
 * Which one applies depends on the order of the generated stylesheet, not on the order in
 * the class attribute, so such a pair can silently drop a style (a pill losing its border
 * to a button reset, for example). Shorthand-plus-side pairs such as `p-0 px-2` or
 * `m-0 mt-1` are fine: Tailwind always orders the side utility after its shorthand.
 */
const properties: Array<[property: string, utility: RegExp]> = [
  ['border-width', /^border(?:-0|-2|-4|-8|-\[\d+(?:\.\d+)?px\])?$/],
  ['background-color', /^bg-(?:rh-[\w-]+|white|black|transparent|current|inherit|\[#[\da-f]+\])$/],
  [
    'color',
    /^text-(?:rh-[\w-]+|white|black|transparent|current|inherit|\[(?:inherit|currentColor|#[\da-f]+)\])$/,
  ],
  ['font-size', /^text-(?:xs|sm|base|lg|\d?xl|\[\d+(?:\.\d+)?(?:px|rem|em)\])$/],
  [
    'font-weight',
    /^font-(?:thin|extralight|light|normal|medium|semibold|bold|extrabold|black|\[\d+\])$/,
  ],
  ['display', /^(?:block|inline|inline-block|flex|inline-flex|grid|inline-grid|hidden|contents)$/],
  ['padding', /^p-/],
  ['padding-inline', /^px-/],
  ['padding-block', /^py-/],
  ['line-height', /^leading-/],
];

/** Split `max-[480px]:hover:px-2` into its variant prefix and utility, ignoring `:` in brackets. */
function split(token: string): [variant: string, utility: string] {
  let depth = 0;
  let cut = -1;
  for (let i = 0; i < token.length; i++) {
    const char = token[i];
    if (char === '[' || char === '(') depth++;
    else if (char === ']' || char === ')') depth--;
    else if (char === ':' && depth === 0) cut = i;
  }
  return [token.slice(0, cut + 1), token.slice(cut + 1)];
}

export function classConflicts(root: ParentNode): string[] {
  const problems: string[] = [];
  for (const element of root.querySelectorAll('[class]')) {
    const seen = new Map<string, string>();
    for (const token of (element.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)) {
      const [variant, utility] = split(token);
      for (const [property, pattern] of properties) {
        if (!pattern.test(utility)) continue;
        const key = `${variant}${property}`;
        const other = seen.get(key);
        if (other === undefined) seen.set(key, token);
        else if (other !== token) {
          const label = element.textContent?.trim().slice(0, 40) ?? '';
          problems.push(
            `<${element.tagName.toLowerCase()}> "${label}": ${other} and ${token} both set ${key}`,
          );
        }
      }
    }
  }
  return problems;
}
