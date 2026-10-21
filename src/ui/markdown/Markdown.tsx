import type { ReactNode } from 'react';
import { isObjectRef, isWebLink, parseMarkdown, type Inline } from './parseMarkdown';
import styles from './Markdown.module.css';

/** Props for {@link Markdown}. */
export interface MarkdownProps {
  /** The Markdown text. */
  source: string;
  /** Opens an object ref a link carries; without it, such links are plain text. */
  onRef?: (ref: string) => void;
}

/**
 * Renders backend Markdown (assessments, reports) as React elements in the dark theme: headings,
 * paragraphs, lists, quotes, code, tables and rules. Web links open in a new tab; a link to an
 * object ref opens that object. No HTML from the text is ever inserted.
 */
export function Markdown({ source, onRef }: MarkdownProps) {
  return (
    <div className={styles.markdown}>
      {parseMarkdown(source).map((block, i) => {
        switch (block.kind) {
          case 'heading': {
            const Tag = `h${Math.min(6, block.level + 2)}` as 'h3';
            return <Tag key={i}>{inline(block.content, onRef)}</Tag>;
          }
          case 'paragraph':
            return <p key={i}>{inline(block.content, onRef)}</p>;
          case 'list': {
            const List = block.ordered ? 'ol' : 'ul';
            return (
              <List key={i}>
                {block.items.map((item, j) => (
                  <li key={j}>{inline(item, onRef)}</li>
                ))}
              </List>
            );
          }
          case 'quote':
            return <blockquote key={i}>{inline(block.content, onRef)}</blockquote>;
          case 'code':
            return (
              <pre key={i}>
                <code>{block.text}</code>
              </pre>
            );
          case 'table':
            return (
              <div key={i} className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      {block.header.map((cell, j) => (
                        <th key={j}>{inline(cell, onRef)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, j) => (
                      <tr key={j}>
                        {row.map((cell, k) => (
                          <td key={k}>{inline(cell, onRef)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case 'rule':
            return <hr key={i} />;
          default:
            return null;
        }
      })}
    </div>
  );
}

/** Inline pieces as elements. */
function inline(pieces: readonly Inline[], onRef?: (ref: string) => void): ReactNode[] {
  return pieces.map((piece, i) => {
    switch (piece.kind) {
      case 'text':
        return piece.text;
      case 'code':
        return <code key={i}>{piece.text}</code>;
      case 'strong':
        return <strong key={i}>{inline(piece.children, onRef)}</strong>;
      case 'em':
        return <em key={i}>{inline(piece.children, onRef)}</em>;
      case 'link':
        if (isWebLink(piece.href)) {
          return (
            <a key={i} href={piece.href} target="_blank" rel="noopener noreferrer">
              {inline(piece.children, onRef)}
            </a>
          );
        }
        if (onRef && isObjectRef(piece.href)) {
          const ref = piece.href;
          return (
            <button key={i} type="button" className={styles.refLink} onClick={() => onRef(ref)}>
              {inline(piece.children, onRef)}
            </button>
          );
        }
        return <span key={i}>{inline(piece.children, onRef)}</span>;
      default:
        return null;
    }
  });
}
