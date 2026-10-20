import type { ObjectEnvelope } from '../../objects/objectApi';
import type {
  AchMatrix,
  Hypothesis,
  HypothesisSet,
  Indicator,
  InformationValue,
} from '../hypothesisApi';
import { SITUATION_ID } from './fixtures';

/** The hypothesis set the 021 tests read. */
export const SET_ID = '01JA8Q0000000000000000000J';

const AT = '2026-10-18T12:00:00Z';

/** A hypothesis of the set, with the fields every one shares. */
function hypothesis(
  id: string,
  fields: Pick<Hypothesis, 'label' | 'statement' | 'probability' | 'confidence'> &
    Partial<Hypothesis>,
): Hypothesis {
  return {
    id,
    setId: SET_ID,
    type: 'outcome',
    prior: 0.3,
    priorBasis: { type: 'base-rate', rationale: 'Swarms at The Geysers since 2000' },
    estimativeTerm: 'unlikely',
    status: 'open',
    ...fields,
  };
}

/** A larger earthquake follows: 21%, down 4 points. */
export const foreshock = hypothesis('01JA8Q0000000000000000000K', {
  label: 'The swarm precedes a larger earthquake',
  statement: 'Foreshock activity ahead of an M5+ event within 30 days.',
  probability: 0.21,
  estimativeTerm: 'unlikely',
  confidence: 'low',
  change: { previousProbability: 0.25, delta: -0.04 },
});

/** Geothermal injection explains the swarm: 72%, up 6 points. */
export const injection = hypothesis('01JA8Q0000000000000000000M', {
  label: 'Geothermal injection explains the swarm',
  statement: 'Induced seismicity from wastewater injection at the steam field.',
  probability: 0.72,
  estimativeTerm: 'likely',
  confidence: 'high',
  change: { previousProbability: 0.66, delta: 0.06 },
});

/** Anything else: 7%, unchanged. */
export const other = hypothesis('01JA8Q0000000000000000000N', {
  label: 'Other',
  statement: 'Another cause.',
  type: 'other',
  probability: 0.07,
  estimativeTerm: 'very unlikely',
  confidence: 'low',
});

/** An indicator of the set. */
function indicator(id: string, fields: Partial<Indicator>): Indicator {
  return {
    id,
    setId: SET_ID,
    description: '',
    signal: { type: 'manual' },
    signalFamily: 'seismic',
    credibility: 'M',
    relevance: 'H',
    lr: {},
    state: 'pending',
    origin: 'analyst',
    ...fields,
  };
}

/**
 * The set's indicators. For the injection hypothesis: three live (P, Q, R), two observed (P and
 * R), one of them supporting (P; R is neutral). For the foreshock: two live (P, Q), one observed
 * (P), weakening it. S is retired and counts for neither.
 */
export const indicators: Indicator[] = [
  indicator('01JA8Q0000000000000000000P', {
    description: 'Injection volumes rose the week before',
    state: 'observed',
    lr: {
      [injection.id]: { class: 'high', direction: 'supports' },
      [foreshock.id]: { class: 'medium', direction: 'weakens' },
    },
  }),
  indicator('01JA8Q0000000000000000000Q', {
    description: 'Hypocenters migrate deeper than 5 km',
    state: 'pending',
    expectedBy: '2026-10-25T00:00:00Z',
    lr: {
      [injection.id]: { class: 'low', direction: 'weakens' },
      [foreshock.id]: { class: 'high', direction: 'supports' },
    },
  }),
  indicator('01JA8Q0000000000000000000R', {
    description: 'Daily counts track the injection schedule',
    state: 'observed',
    lr: { [injection.id]: { class: 'neutral', direction: 'supports' } },
  }),
  indicator('01JA8Q0000000000000000000S', {
    description: 'An old indicator',
    state: 'retired',
    lr: { [injection.id]: { class: 'high', direction: 'supports' } },
  }),
];

/** The set: is the swarm induced, a foreshock sequence, or something else? */
export const hypothesisSet: HypothesisSet = {
  id: SET_ID,
  question: 'What is driving the Northern California seismic swarm?',
  kind: 'exclusive',
  cadence: 'weekly',
  horizon: '2026-11-18',
  status: 'active',
  situationId: SITUATION_ID,
  regionCodes: ['US-CA'],
  origin: 'analyst',
  confidence: 'moderate',
  lastRevisionAt: AT,
  private: false,
  version: 3,
  hypotheses: [foreshock, injection, other],
  assumptions: [
    {
      id: '01JA8Q0000000000000000000T',
      setId: SET_ID,
      text: 'The injection logs are complete.',
      linchpin: true,
      status: 'caveated',
      updatedAt: AT,
    },
  ],
  createdAt: '2026-10-02T00:00:00Z',
  updatedAt: AT,
};

/** A second set linked to the situation, with no hypotheses yet. */
export const otherSet: HypothesisSet = {
  ...hypothesisSet,
  id: '01JA8Q0000000000000000000V',
  question: 'Will the outage spread beyond Sonoma County?',
  status: 'resolved',
  hypotheses: [],
  assumptions: [],
};

/** The set's envelope, offering `addHypothesis`. */
export const setEnvelope: ObjectEnvelope = {
  ref: `hypothesis-set:${SET_ID}`,
  type: 'hypothesis-set',
  title: hypothesisSet.question,
  actions: [
    {
      id: 'add-hypothesis',
      method: 'POST',
      href: `/v1/hypotheses/sets/${SET_ID}/hypotheses`,
      scope: 'agent',
    },
  ],
};

/**
 * The matrix: a heavy row inconsistent with the foreshock, a non-diagnostic row, and a removed
 * row; the injection hypothesis least inconsistent.
 */
export const matrix: AchMatrix = {
  setId: SET_ID,
  computedAt: AT,
  hypotheses: [foreshock, injection, other].map((h) => ({
    id: h.id,
    label: h.label,
    probability: h.probability,
    inconsistencyScore: 0,
  })),
  rows: [
    {
      id: '01JA8Q0000000000000000000W',
      setId: SET_ID,
      source: 'manual',
      description: 'Every event since June is shallower than 4 km',
      credibility: 'M',
      relevance: 'M',
      weight: 1,
      ratings: { [foreshock.id]: 'C', [injection.id]: 'C', [other.id]: 'C' },
      nonDiagnostic: true,
      addedBy: 'analyst',
      addedAt: AT,
    },
    {
      id: '01JA8Q0000000000000000000X',
      setId: SET_ID,
      source: 'record',
      ref: 'record:usgs-earthquakes/nc75095651',
      description: 'The largest event is M 4.6 with no aftershock decay',
      credibility: 'H',
      relevance: 'H',
      weight: 4,
      ratings: { [foreshock.id]: 'II', [injection.id]: 'C', [other.id]: 'N' },
      addedBy: 'analyst',
      addedAt: AT,
    },
    {
      id: '01JA8Q0000000000000000000Y',
      setId: SET_ID,
      source: 'manual',
      description: 'A withdrawn report',
      credibility: 'L',
      relevance: 'L',
      ratings: {},
      addedBy: 'analyst',
      addedAt: AT,
      removedAt: AT,
    },
  ],
  scores: { [foreshock.id]: -8, [injection.id]: 0, [other.id]: 0 },
  leastInconsistentHypothesisId: injection.id,
  note: 'Audit view: probabilities come from the updater and are scored in the ledger',
};

/** The pending indicators by information value: the best gains 0.25 of 0.8 nats (High). */
export const informationValue: InformationValue = {
  setId: SET_ID,
  computedAt: AT,
  entropy: 0.8,
  version: 'InformationValue 1.0.0',
  indicators: [
    {
      indicatorId: '01JA8Q0000000000000000000Z',
      description: 'Satellite deformation over the steam field',
      signalFamily: 'imagery',
      state: 'pending',
      rank: 2,
      eig: 0.05,
      potentialEig: 0.4,
      pDetect: 0.1,
      collectionGap: true,
    },
    {
      indicatorId: indicators[1]!.id,
      description: indicators[1]!.description,
      signalFamily: 'seismic',
      state: 'pending',
      rank: 1,
      eig: 0.25,
      potentialEig: 0.3,
      pDetect: 0.8,
      collectionGap: false,
    },
  ],
};
