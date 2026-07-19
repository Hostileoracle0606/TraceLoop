export type SNode = string | SNode[];

/** Parse the first top-level S-expression. Strings may contain parens/escapes. */
export function parseSexpr(input: string): SNode {
  let i = 0;

  function skipWs() {
    while (i < input.length && /\s/.test(input[i]!)) i++;
  }

  function readString(): string {
    i++; // opening quote
    let out = '';
    while (i < input.length) {
      const ch = input[i]!;
      if (ch === '\\' && i + 1 < input.length) {
        out += input[i + 1];
        i += 2;
        continue;
      }
      if (ch === '"') {
        i++;
        return out;
      }
      out += ch;
      i++;
    }
    throw new Error('unbalanced quotes in S-expression');
  }

  function readAtom(): string {
    let out = '';
    while (i < input.length && !/[\s()]/.test(input[i]!)) {
      out += input[i]!;
      i++;
    }
    return out;
  }

  function readList(): SNode[] {
    i++; // opening paren
    const list: SNode[] = [];
    for (;;) {
      skipWs();
      if (i >= input.length) throw new Error('unbalanced parens in S-expression');
      const ch = input[i]!;
      if (ch === ')') { i++; return list; }
      if (ch === '(') { list.push(readList()); continue; }
      if (ch === '"') { list.push(readString()); continue; }
      list.push(readAtom());
    }
  }

  skipWs();
  if (input[i] !== '(') throw new Error('unbalanced parens: expected opening paren');
  return readList();
}
