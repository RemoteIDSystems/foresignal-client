import type { ForesignalClient } from '../api/client';
import { unwrap } from '../api/client';
import type { components } from '../api/generated/schema';

type Schemas = components['schemas'];

/** A source's health (`SourceHealth`). */
export type SourceHealth = Schemas['SourceHealth'];
/** A source's health status: `healthy`, `degraded`, `failing`, `idle` or `disabled`. */
export type HealthStatus = Schemas['HealthStatus'];
/** A source's descriptor, settings and health (`SourceDetail`). */
export type SourceDetail = Schemas['SourceDetail'];
/** An export, snapshot or pack job (`ExportJob`). */
export type ExportJob = Schemas['ExportJob'];
/** A scheduled briefing (`Briefing`). */
export type Briefing = Schemas['Briefing'];
/** One run of a briefing (`BriefingRun`). */
export type BriefingRun = Schemas['BriefingRun'];
/** A notification channel (`Channel`). */
export type Channel = Schemas['Channel'];
/** One delivery through a channel (`NotificationDelivery`). */
export type Delivery = Schemas['NotificationDelivery'];
/** A sink (`Sink`). */
export type Sink = Schemas['Sink'];
/** A sink's cursor, lag and counters (`SinkStatus`). */
export type SinkStatus = Schemas['SinkStatus'];
/** A registered native push device (`PushDevice`). */
export type PushDevice = Schemas['PushDevice'];
/** An alert rule (`TriggerRule`). */
export type TriggerRule = Schemas['TriggerRule'];
/** An escalation policy (`EscalationPolicy`). */
export type EscalationPolicy = Schemas['EscalationPolicy'];
/** An analysis cycle (`AnalysisCycle`). */
export type AnalysisCycle = Schemas['AnalysisCycle'];
/** A chronicle (`Chronicle`). */
export type Chronicle = Schemas['Chronicle'];

/** A briefing run with the briefing it belongs to. */
export interface NamedRun extends BriefingRun {
  briefingName: string;
}

/** A sink with its status, or why the status did not load. */
export interface SinkRow {
  sink: Sink;
  status?: SinkStatus;
  error?: string;
}

/** Every source's health (`listSourceHealth`). */
export function listSourceHealth(
  api: ForesignalClient,
  signal?: AbortSignal,
): Promise<SourceHealth[]> {
  return unwrap(api.GET('/v1/sources/health', { signal }));
}

/** One source's descriptor, settings and health (`getSource`). */
export function getSource(
  api: ForesignalClient,
  sourceId: string,
  signal?: AbortSignal,
): Promise<SourceDetail> {
  return unwrap(api.GET('/v1/sources/{sourceId}', { params: { path: { sourceId } }, signal }));
}

/** The newest export, snapshot and pack jobs (`listExports`; agent scope). */
export async function listExports(
  api: ForesignalClient,
  limit: number,
  signal?: AbortSignal,
): Promise<ExportJob[]> {
  const page = await unwrap(api.GET('/v1/exports', { params: { query: { limit } }, signal }));
  return page.items;
}

/**
 * The newest runs across every briefing (`listBriefings`, then `listBriefingRuns` for each),
 * newest started first, at most `limit`.
 */
export async function listRecentRuns(
  api: ForesignalClient,
  limit: number,
  signal?: AbortSignal,
): Promise<NamedRun[]> {
  const briefings = await unwrap(api.GET('/v1/briefings', { signal }));
  const pages = await Promise.all(
    briefings.map((briefing) =>
      unwrap(
        api.GET('/v1/briefings/{briefingId}/runs', {
          params: { path: { briefingId: briefing.id }, query: { limit } },
          signal,
        }),
      ).then((page) => page.items.map((run) => ({ ...run, briefingName: briefing.name }))),
    ),
  );
  return pages
    .flat()
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
    .slice(0, limit);
}

/** The scheduled briefings (`listBriefings`). */
export function listBriefings(api: ForesignalClient, signal?: AbortSignal): Promise<Briefing[]> {
  return unwrap(api.GET('/v1/briefings', { signal }));
}

/** The notification channels (`listChannels`; admin scope). */
export function listChannels(api: ForesignalClient, signal?: AbortSignal): Promise<Channel[]> {
  return unwrap(api.GET('/v1/channels', { signal }));
}

/** A channel's newest deliveries (`listChannelDeliveries`; admin scope). */
export async function listChannelDeliveries(
  api: ForesignalClient,
  channelId: string,
  limit: number,
  signal?: AbortSignal,
): Promise<Delivery[]> {
  const page = await unwrap(
    api.GET('/v1/channels/{channelId}/deliveries', {
      params: { path: { channelId }, query: { limit } },
      signal,
    }),
  );
  return page.items;
}

/**
 * The sinks with their status (`listSinks`, then `getSinkStatus` for each; admin scope). A status
 * that does not load is kept as its error, so the sink is still listed.
 */
export async function listSinkRows(
  api: ForesignalClient,
  signal?: AbortSignal,
): Promise<SinkRow[]> {
  const page = await unwrap(api.GET('/v1/sinks', { params: { query: { limit: 100 } }, signal }));
  return Promise.all(
    page.items.map((sink) =>
      unwrap(
        api.GET('/v1/sinks/{sinkId}/status', { params: { path: { sinkId: sink.id } }, signal }),
      )
        .then((status): SinkRow => ({ sink, status }))
        .catch((error: unknown): SinkRow => ({
          sink,
          error: error instanceof Error ? error.message : 'The status did not load.',
        })),
    ),
  );
}

/** The registered native push devices (`listPushDevices`; token required). */
export function listPushDevices(
  api: ForesignalClient,
  signal?: AbortSignal,
): Promise<PushDevice[]> {
  return unwrap(api.GET('/v1/push/devices', { signal }));
}

/** The alert rules (`listTriggers`). */
export function listTriggers(api: ForesignalClient, signal?: AbortSignal): Promise<TriggerRule[]> {
  return unwrap(api.GET('/v1/triggers', { signal }));
}

/** The escalation policies (`listEscalationPolicies`; agent scope). */
export function listEscalationPolicies(
  api: ForesignalClient,
  signal?: AbortSignal,
): Promise<EscalationPolicy[]> {
  return unwrap(api.GET('/v1/escalation-policies', { signal }));
}

/** The analysis cycles (`listAnalysisCycles`). */
export async function listAnalysisCycles(
  api: ForesignalClient,
  signal?: AbortSignal,
): Promise<AnalysisCycle[]> {
  const page = await unwrap(
    api.GET('/v1/analysis/cycles', { params: { query: { limit: 100 } }, signal }),
  );
  return page.items;
}

/** The chronicles visible to the caller (`listChronicles`; token required). */
export async function listChronicles(
  api: ForesignalClient,
  signal?: AbortSignal,
): Promise<Chronicle[]> {
  const page = await unwrap(
    api.GET('/v1/chronicles', { params: { query: { limit: 100 } }, signal }),
  );
  return page.items;
}
