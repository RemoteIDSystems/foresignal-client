import {
  inlineText,
  isObjectRef,
  isWebLink,
  parseInline,
  parseMarkdown,
  type Block,
} from './parseMarkdown';

/** A block narrowed to its kind, after checking it is that kind. */
function of<K extends Block['kind']>(
  block: Block | undefined,
  kind: K,
): Extract<Block, { kind: K }> {
  expect(block?.kind).toBe(kind);
  return block as Extract<Block, { kind: K }>;
}

describe('the Markdown parser', () => {
  it('reads headings, paragraphs, lists, quotes, code, tables and rules', () => {
    const blocks = parseMarkdown(
      [
        '## Outlook',
        'First line',
        'second line.',
        '',
        '- one',
        '  continued',
        '- two',
        '1. first',
        '2) second',
        '> quoted',
        '```',
        'a | b',
        '```',
        '| H | P |',
        '| --- | ---: |',
        '| Injection | 72% |',
        '---',
      ].join('\n'),
    );
    expect(blocks.map((b) => b.kind)).toEqual([
      'heading',
      'paragraph',
      'list',
      'list',
      'quote',
      'code',
      'table',
      'rule',
    ]);
    expect(blocks[0]).toMatchObject({ kind: 'heading', level: 2 });
    expect(inlineText(of(blocks[1], 'paragraph').content)).toBe('First line second line.');
    const bullets = of(blocks[2], 'list');
    expect(bullets.ordered).toBe(false);
    expect(bullets.items.map(inlineText)).toEqual(['one continued', 'two']);
    expect(of(blocks[3], 'list').ordered).toBe(true);
    expect(blocks[5]).toEqual({ kind: 'code', text: 'a | b' });
    const table = of(blocks[6], 'table');
    expect(table.header.map(inlineText)).toEqual(['H', 'P']);
    expect(table.rows[0]!.map(inlineText)).toEqual(['Injection', '72%']);
  });

  it('reads bold, italics, code and links, nested', () => {
    expect(parseInline('a **b _c_** `d` [e](https://x.test) f')).toEqual([
      { kind: 'text', text: 'a ' },
      {
        kind: 'strong',
        children: [
          { kind: 'text', text: 'b ' },
          { kind: 'em', children: [{ kind: 'text', text: 'c' }] },
        ],
      },
      { kind: 'text', text: ' ' },
      { kind: 'code', text: 'd' },
      { kind: 'text', text: ' ' },
      { kind: 'link', href: 'https://x.test', children: [{ kind: 'text', text: 'e' }] },
      { kind: 'text', text: ' f' },
    ]);
    expect(parseInline('snake_case_name')).toEqual([{ kind: 'text', text: 'snake_case_name' }]);
  });

  it('tells object refs from web links', () => {
    expect(isObjectRef('finding:01JA8Q00000000000000000000')).toBe(true);
    expect(isObjectRef('record:usgs-earthquakes/nc1')).toBe(true);
    expect(isObjectRef('https://x.test')).toBe(false);
    expect(isObjectRef('javascript:alert(1)')).toBe(false);
    expect(isWebLink('https://x.test')).toBe(true);
    expect(isWebLink('javascript:alert(1)')).toBe(false);
  });
});
