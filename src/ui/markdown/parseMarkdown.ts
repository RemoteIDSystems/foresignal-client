/** A piece of inline text: plain, bold, italic, code, or a link. */
export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; children: Inline[] }
  | { kind: 'em'; children: Inline[] }
  | { kind: 'code'; text: string }
  | { kind: 'link'; href: string; children: Inline[] };

/** A block of a document. */
export type Block =
  | { kind: 'heading'; level: number; content: Inline[] }
  | { kind: 'paragraph'; content: Inline[] }
  | { kind: 'list'; ordered: boolean; items: Inline[][] }
  | { kind: 'quote'; content: Inline[] }
  | { kind: 'code'; text: string }
  | { kind: 'table'; header: Inline[][]; rows: Inline[][][] }
  | { kind: 'rule' };

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const FENCE = /^\s*```/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const TABLE_DIVIDER = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

/** The cells of a pipe-table row. */
function cells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

/**
 * Parses the subset of Markdown the backend's assessments and reports use: ATX headings,
 * paragraphs, bullet and numbered lists, quotes, fenced code, pipe tables and rules; inline bold,
 * italics, code and links. Anything else is kept as text: no HTML is ever produced.
 */
export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.trim() === '') {
      i += 1;
      continue;
    }
    if (FENCE.test(line)) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !FENCE.test(lines[i]!)) body.push(lines[i++]!);
      i += 1;
      blocks.push({ kind: 'code', text: body.join('\n') });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({
        kind: 'heading',
        level: heading[1]!.length,
        content: parseInline(heading[2]!),
      });
      i += 1;
      continue;
    }
    if (RULE.test(line)) {
      blocks.push({ kind: 'rule' });
      i += 1;
      continue;
    }
    if (line.includes('|') && i + 1 < lines.length && TABLE_DIVIDER.test(lines[i + 1]!)) {
      const header = cells(line).map(parseInline);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && lines[i]!.includes('|') && lines[i]!.trim() !== '') {
        rows.push(cells(lines[i]!).map(parseInline));
        i += 1;
      }
      blocks.push({ kind: 'table', header, rows });
      continue;
    }
    const ordered = NUMBERED.test(line);
    if (ordered || BULLET.test(line)) {
      const pattern = ordered ? NUMBERED : BULLET;
      const items: Inline[][] = [];
      while (i < lines.length && pattern.test(lines[i]!)) {
        let text = pattern.exec(lines[i]!)![1]!;
        i += 1;
        // A continuation line (indented, not a new item) joins its item.
        while (
          i < lines.length &&
          /^\s{2,}\S/.test(lines[i]!) &&
          !BULLET.test(lines[i]!) &&
          !NUMBERED.test(lines[i]!)
        ) {
          text += ` ${lines[i]!.trim()}`;
          i += 1;
        }
        items.push(parseInline(text));
      }
      blocks.push({ kind: 'list', ordered, items });
      continue;
    }
    if (line.trimStart().startsWith('>')) {
      const body: string[] = [];
      while (i < lines.length && lines[i]!.trimStart().startsWith('>')) {
        body.push(lines[i]!.trimStart().replace(/^>\s?/, ''));
        i += 1;
      }
      blocks.push({ kind: 'quote', content: parseInline(body.join(' ')) });
      continue;
    }
    const body: string[] = [];
    while (
      i < lines.length &&
      lines[i]!.trim() !== '' &&
      !HEADING.test(lines[i]!) &&
      !FENCE.test(lines[i]!) &&
      !BULLET.test(lines[i]!) &&
      !NUMBERED.test(lines[i]!) &&
      !lines[i]!.trimStart().startsWith('>')
    ) {
      body.push(lines[i]!.trim());
      i += 1;
    }
    blocks.push({ kind: 'paragraph', content: parseInline(body.join(' ')) });
  }
  return blocks;
}

/** Parses inline Markdown: `code`, **bold**, *italic* or _italic_, and [text](href). */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let plain = '';
  const flush = () => {
    if (plain) out.push({ kind: 'text', text: plain });
    plain = '';
  };
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    const code = /^`([^`]+)`/.exec(rest);
    if (code) {
      flush();
      out.push({ kind: 'code', text: code[1]! });
      i += code[0].length;
      continue;
    }
    const strong = /^(\*\*|__)(.+?)\1/.exec(rest);
    if (strong) {
      flush();
      out.push({ kind: 'strong', children: parseInline(strong[2]!) });
      i += strong[0].length;
      continue;
    }
    const em = /^([*_])(?!\s)(.+?)(?<!\s)\1(?![*_\w])/.exec(rest);
    if (em) {
      flush();
      out.push({ kind: 'em', children: parseInline(em[2]!) });
      i += em[0].length;
      continue;
    }
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(rest);
    if (link) {
      flush();
      out.push({ kind: 'link', href: link[2]!, children: parseInline(link[1]!) });
      i += link[0].length;
      continue;
    }
    plain += text[i];
    i += 1;
  }
  flush();
  return out;
}

/** The plain text of inline pieces. */
export function inlineText(pieces: readonly Inline[]): string {
  return pieces
    .map((piece) =>
      piece.kind === 'text' || piece.kind === 'code' ? piece.text : inlineText(piece.children),
    )
    .join('');
}

/** An object ref a link may carry (`finding:01J…`), as against a web address. */
export function isObjectRef(href: string): boolean {
  return (
    /^[a-z][a-z-]*:(?!\/\/)\S+$/.test(href) && !/^(https?|mailto|javascript|data):/i.test(href)
  );
}

/** Whether a link is a web address that may be opened. */
export function isWebLink(href: string): boolean {
  return /^https?:\/\//i.test(href);
}
