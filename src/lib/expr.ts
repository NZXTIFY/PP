/**
 * Räknar ut enkla uttryck som "6170+1005+2286", "1 817 + 244" eller "=450+74".
 * Stöder + - * / och parenteser, decimalkomma och mellanslag som tusentalsavgränsare.
 * Ingen eval – en liten rekursiv parser.
 */
export function evaluate(input: string): number | null {
  const src = input
    .replace(/\s+/g, '')
    .replace(/[−–]/g, '-')
    .replace(/[x×]/gi, '*')
    .replace(/^=/, '');
  if (src === '') return 0;

  let pos = 0;

  const peek = () => src[pos];

  function parseExpr(): number {
    let value = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const op = src[pos++];
      const rhs = parseTerm();
      value = op === '+' ? value + rhs : value - rhs;
    }
    return value;
  }

  function parseTerm(): number {
    let value = parseFactor();
    while (peek() === '*' || peek() === '/') {
      const op = src[pos++];
      const rhs = parseFactor();
      value = op === '*' ? value * rhs : value / rhs;
    }
    return value;
  }

  function parseFactor(): number {
    const c = peek();
    if (c === '-') {
      pos++;
      return -parseFactor();
    }
    if (c === '+') {
      pos++;
      return parseFactor();
    }
    if (c === '(') {
      pos++;
      const value = parseExpr();
      if (peek() !== ')') throw new Error('saknar )');
      pos++;
      return value;
    }
    const match = /^\d+(?:[.,]\d+)?|^[.,]\d+/.exec(src.slice(pos));
    if (!match) throw new Error('väntade ett tal');
    pos += match[0].length;
    return parseFloat(match[0].replace(',', '.'));
  }

  try {
    const value = parseExpr();
    if (pos !== src.length || !Number.isFinite(value)) return null;
    return Math.round(value * 100) / 100;
  } catch {
    return null;
  }
}

/** Samma som evaluate men ogiltiga uttryck blir 0. */
export function evalOr0(input: string): number {
  return evaluate(input) ?? 0;
}

/** True om uttrycket är mer än ett enskilt tal, t.ex. "1700+2266". */
export function isFormula(input: string): boolean {
  return /\d\s*[+\-*/×x]\s*[\d(]/i.test(input.replace(/^=/, ''));
}
