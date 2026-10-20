import { useEffect, useState } from 'react';
import type { ForesignalClient } from '../api/client';
import { parseObjectRef } from '../lib/objectRef';
import {
  getFinding,
  listAnalysisSeries,
  listFindings,
  listImpactRates,
  listProjectedImpacts,
  type AnalysisSeries,
  type AnalyticFinding,
  type ImpactRate,
  type ProjectedImpact,
} from './analyticsApi';
import type { Analysis } from './useAnalysis';

/** The most regions whose impacts are read, one request each. */
export const IMPACT_REGIONS = 4;

/** The most findings an investigation's items name that are read, one request each. */
export const ITEM_FINDINGS = 50;

/** One part of the evidence: loading, loaded, or failed with a message. */
export type Part<T> =
  { status: 'loading' } | { status: 'ready'; value: T } | { status: 'error'; message: string };

/** What the Evidence tab shows besides the members: findings, impacts, rates and series. */
export interface EvidenceState {
  findings: Part<AnalyticFinding[]>;
  impacts: Part<ProjectedImpact[]>;
  rates: Part<ImpactRate[]>;
  series: Part<AnalysisSeries[]>;
}

const LOADING: EvidenceState = {
  findings: { status: 'loading' },
  impacts: { status: 'loading' },
  rates: { status: 'loading' },
  series: { status: 'loading' },
};

/** What a scope reads, from the analysis: a situation's id and regions, an investigation's findings. */
export interface EvidenceScope {
  situationId?: string;
  regions: string[];
  since?: string;
  /** Finding ids an investigation's items name. */
  findingIds: string[];
}

/** The evidence scope of an analysis. */
export function evidenceScope(analysis: Analysis): EvidenceScope {
  if (analysis.kind === 'situation') {
    const { situation } = analysis;
    return {
      situationId: situation.id,
      regions: situation.regionCodes.filter((code) => code !== 'ZZ'),
      since: situation.startedAt,
      findingIds: [],
    };
  }
  const findingIds = (analysis.investigation.items ?? [])
    .map((item) => parseObjectRef(item.objectRef ?? item.ref))
    .filter((parts) => parts?.type === 'finding')
    .map((parts) => parts!.id);
  return { regions: [], findingIds: [...new Set(findingIds)].slice(0, ITEM_FINDINGS) };
}

/** Findings for a scope: a situation's linked findings, or the ones an investigation pins. */
async function scopeFindings(
  api: ForesignalClient,
  scope: EvidenceScope,
  signal: AbortSignal,
): Promise<AnalyticFinding[]> {
  if (scope.situationId) return listFindings(api, { situationId: scope.situationId }, signal);
  return Promise.all(scope.findingIds.map((id) => getFinding(api, id, signal)));
}

/** Projected impacts in a scope's regions, each once, highest probability first. */
async function scopeImpacts(
  api: ForesignalClient,
  scope: EvidenceScope,
  signal: AbortSignal,
): Promise<ProjectedImpact[]> {
  const pages = await Promise.all(
    scope.regions
      .slice(0, IMPACT_REGIONS)
      .map((region) => listProjectedImpacts(api, { region, since: scope.since }, signal)),
  );
  const unique = new Map(pages.flat().map((impact) => [impact.findingId, impact]));
  return [...unique.values()].sort((a, b) => b.pImpact - a.pImpact);
}

/**
 * Loads the Evidence tab's findings, projected impacts, impact rates and analysis series for an
 * analysis (020), each on its own so one failing leaves the rest. A situation reads its linked
 * findings, the impacts and series of its regions; an investigation reads the findings its items
 * pin, and has no regions.
 */
export function useEvidence(
  api: ForesignalClient | undefined,
  scope: EvidenceScope,
): EvidenceState {
  const [state, setState] = useState<EvidenceState>(LOADING);
  const key = JSON.stringify(scope);
  const [loadedKey, setLoadedKey] = useState(key);
  if (loadedKey !== key) {
    setLoadedKey(key);
    setState(LOADING);
  }
  useEffect(() => {
    if (!api) return;
    const parsed = JSON.parse(key) as EvidenceScope;
    const controller = new AbortController();
    const { signal } = controller;
    const settle = <K extends keyof EvidenceState>(
      part: K,
      load: Promise<EvidenceState[K] extends Part<infer T> ? T : never>,
    ) =>
      load.then(
        (value) =>
          !signal.aborted &&
          setState((current) => ({ ...current, [part]: { status: 'ready', value } })),
        (error: unknown) =>
          !signal.aborted &&
          setState((current) => ({
            ...current,
            [part]: {
              status: 'error',
              message: error instanceof Error ? error.message : 'It did not load.',
            },
          })),
      );
    void settle('findings', scopeFindings(api, parsed, signal));
    void settle('impacts', scopeImpacts(api, parsed, signal));
    void settle('rates', listImpactRates(api, signal));
    void settle(
      'series',
      parsed.regions.length > 0
        ? listAnalysisSeries(api, { region: parsed.regions }, signal)
        : Promise.resolve([]),
    );
    return () => controller.abort();
  }, [api, key]);
  return state;
}
