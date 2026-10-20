import { recordRef } from '../lib/objectRef';
import type { AskCitation } from './askApi';

/**
 * The object ref a citation selects: a record's (`<sourceId>:<externalId>`) from its source and id;
 * an alert or briefing is cited by its ref already (`alert:<id>`, `briefing:<id>`). A weather value
 * is not an object, so it selects nothing.
 */
export function citationRef(citation: AskCitation): string | undefined {
  if (citation.type === 'weather') return undefined;
  if (citation.type !== 'record') return citation.id;
  const colon = citation.id.indexOf(':');
  if (colon <= 0 || colon === citation.id.length - 1) return undefined;
  return recordRef(citation.id.slice(0, colon), citation.id.slice(colon + 1));
}

/** A piece of an answer's text: plain text, or a citation marker standing for a cited object. */
export type AnswerPiece = { text: string } | { citation: AskCitation; index: number };

/**
 * Splits an answer at its citation markers (`[source:externalId@seq]`, or without the `@seq`), so
 * each can be drawn as a chip for its object. A bracket that cites nothing the answer lists is left
 * as text.
 */
export function answerPieces(answer: string, citations: readonly AskCitation[]): AnswerPiece[] {
  const pieces: AnswerPiece[] = [];
  const marker = /\[([^\][\s]+)\]/g;
  let last = 0;
  for (let match = marker.exec(answer); match; match = marker.exec(answer)) {
    const cited = match[1]!;
    const index = citations.findIndex(
      (citation) =>
        cited === citation.id ||
        (citation.seq != null && cited === `${citation.id}@${citation.seq}`) ||
        cited.replace(/@\d+$/, '') === citation.id,
    );
    if (index === -1) continue;
    if (match.index > last) pieces.push({ text: answer.slice(last, match.index) });
    pieces.push({ citation: citations[index]!, index });
    last = match.index + match[0].length;
  }
  if (last < answer.length) pieces.push({ text: answer.slice(last) });
  return pieces;
}

/** What a failed Ask or search says, by the backend's problem. */
export function askProblem(error: unknown, what: 'Ask' | 'Search'): string {
  const failure = error as { status?: number; code?: string; detail?: string; retryAfter?: number };
  if (failure?.status === 401) {
    return `${what} needs an access token, even with open reads. Add one in Settings.`;
  }
  if (failure?.code === 'LLM_NOT_CONFIGURED') {
    return 'No language model is assigned on this server, so Ask cannot answer. An administrator assigns one in the LLM settings.';
  }
  if (failure?.code === 'LLM_BUDGET_EXCEEDED') {
    return 'The language model budget is used up for now.';
  }
  if (failure?.status === 429) {
    return `${what} is rate limited${failure.retryAfter ? `; try again in ${failure.retryAfter} s` : ''}.`;
  }
  return failure?.detail ?? (error instanceof Error ? error.message : `${what} did not answer.`);
}
