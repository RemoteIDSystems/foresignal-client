// @vitest-environment node
import type { AskCitation } from './askApi';
import { answerPieces, askProblem, citationRef } from './askView';

const quake: AskCitation = {
  id: 'usgs-earthquakes:nc75452571',
  seq: 4,
  title: 'M 2.5 - The Geysers',
  type: 'record',
};

describe('citations', () => {
  it('name the object they select', () => {
    expect(citationRef(quake)).toBe('record:usgs-earthquakes/nc75452571');
    expect(citationRef({ id: 'alert:7', title: 'a', type: 'alert' })).toBe('alert:7');
    expect(citationRef({ id: 'wx:gfs@2026102012/6', title: 'w', type: 'weather' })).toBeUndefined();
  });

  it('stand in the answer where its markers are, with or without the seq', () => {
    const pieces = answerPieces(
      'A quake [usgs-earthquakes:nc75452571@4] struck; see [usgs-earthquakes:nc75452571]. [note]',
      [quake],
    );
    expect(pieces).toEqual([
      { text: 'A quake ' },
      { citation: quake, index: 0 },
      { text: ' struck; see ' },
      { citation: quake, index: 0 },
      { text: '. [note]' },
    ]);
  });
});

describe('askProblem', () => {
  it('says plainly why Ask or search did not answer', () => {
    expect(askProblem({ status: 401 }, 'Search')).toBe(
      'Search needs an access token, even with open reads. Add one in Settings.',
    );
    expect(askProblem({ status: 409, code: 'LLM_NOT_CONFIGURED' }, 'Ask')).toMatch(
      /^No language model is assigned on this server/,
    );
    expect(askProblem({ status: 429, retryAfter: 12 }, 'Ask')).toBe(
      'Ask is rate limited; try again in 12 s.',
    );
    expect(askProblem({ status: 400, detail: 'Question too long' }, 'Ask')).toBe(
      'Question too long',
    );
  });
});
