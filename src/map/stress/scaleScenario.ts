import { Cartesian3, SceneMode } from 'cesium';
import { openStreams } from '../../api/stream/sse';
import type { DrawnTotals } from '../records/recordLayerSet';
import type { MapEngine } from './engineProbe';
import { SLOW_FRAME_MS, type FrameStats } from './frameStats';
import { measureFrames, measureToggle, type StressResult } from './stressMode';

/** The path of the one live change stream (011), which must stay a single connection. */
export const CHANGE_STREAM_PATH = '/v1/events/stream';

/** One camera position of the scale scenario. */
export interface ScaleStep {
  label: string;
  longitude: number;
  latitude: number;
  /** Camera height, in meters. */
  height: number;
}

/**
 * The scenario's zoom levels (035): the whole world, where dense kinds draw as cells; a region;
 * and a city, where records load only in view.
 */
export const SCALE_STEPS: readonly ScaleStep[] = [
  { label: 'World', longitude: -40, latitude: 25, height: 20_000_000 },
  { label: 'Region', longitude: -95, latitude: 37, height: 2_500_000 },
  { label: 'City', longitude: -95.36, latitude: 29.76, height: 60_000 },
];

/** How long frames are timed at each step, in ms. */
export const STEP_FRAMES_MS = 3_000;

/** How long a step waits for the layers to load and build, in ms. */
export const SETTLE_TIMEOUT_MS = 120_000;

/** How often the settling layers are sampled, in ms. */
const SAMPLE_MS = 200;

/** Samples in a row with nothing loading for the layers to count as settled. */
const QUIET_SAMPLES = 5;

/** What one step measured. */
export interface ScaleStepResult {
  label: string;
  height: number;
  /** Whether the layers settled before {@link SETTLE_TIMEOUT_MS}. */
  settled: boolean;
  /** Ms from moving the camera until the layers settled (or gave up). */
  settleMs: number;
  /** What was drawn once settled. */
  totals: DrawnTotals;
  /** The most tile requests in flight and waiting at once while settling. */
  peakRequests: { active: number; waiting: number };
  /** Frame timing while panning, once settled. */
  frames: FrameStats;
  /** The JavaScript heap in use (Chromium's `performance.memory`), when the browser reports it. */
  heapBytes?: number;
  /** Server-sent event connections open, by path. */
  streams: Record<string, number>;
}

/** The scenario's report. */
export interface ScaleReport {
  /** When it ran. */
  at: string;
  mode: '2D' | '3D';
  /** Record layers on. */
  layers: number;
  steps: ScaleStepResult[];
  /** The most change-stream connections seen open at once, across the steps. */
  maxChangeStreams: number;
  /** Turning one layer off and on at the last step. */
  toggle?: StressResult['toggle'];
  /** What the run found wrong ({@link scaleProblems}); empty when the client held up. */
  problems: string[];
}

/** Options for {@link runScaleScenario}; the defaults are the real ones. */
export interface ScaleOptions {
  steps?: readonly ScaleStep[];
  frameMs?: number;
  settleTimeoutMs?: number;
  /** Times frames; {@link measureFrames} by default. */
  measure?: (engine: MapEngine, ms: number) => Promise<FrameStats>;
  /** Waits between samples; an animation-frame-friendly timeout by default. */
  wait?: (ms: number) => Promise<void>;
  /** Reads the open streams; {@link openStreams} by default. */
  streams?: () => Record<string, number>;
  /** Reads the heap in use; {@link heapBytes} by default. */
  heap?: () => number | undefined;
  /** The clock, in ms; `performance.now` by default. */
  now?: () => number;
}

/** The JavaScript heap in use, in bytes, where the browser reports it (Chromium); else undefined. */
export function heapBytes(): number | undefined {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory;
  return memory?.usedJSHeapSize;
}

/**
 * Waits until no layer is loading, no tile request is waiting or in flight and no merged primitive
 * is building, for {@link QUIET_SAMPLES} samples in a row, or until the timeout. Returns whether it
 * settled, how long it took and the peak of requests seen.
 */
export async function settle(
  engine: MapEngine,
  timeoutMs: number,
  wait: (ms: number) => Promise<void>,
  now: () => number,
): Promise<{ settled: boolean; ms: number; peak: { active: number; waiting: number } }> {
  const start = now();
  const peak = { active: 0, waiting: 0 };
  let quiet = 0;
  for (;;) {
    const totals = engine.layers.totals();
    const requests = engine.layers.requests;
    peak.active = Math.max(peak.active, requests.active);
    peak.waiting = Math.max(peak.waiting, requests.waiting);
    const busy = totals.loading + requests.active + requests.waiting > 0 || totals.building;
    quiet = busy ? 0 : quiet + 1;
    if (quiet >= QUIET_SAMPLES) return { settled: true, ms: now() - start, peak };
    if (now() - start >= timeoutMs) return { settled: false, ms: now() - start, peak };
    await wait(SAMPLE_MS);
  }
}

/**
 * Runs the scale scenario (035) on the map as it is (with the layers already on): at each of
 * {@link SCALE_STEPS} it moves the camera, waits for the layers to settle, and records what is
 * drawn, the peak of tile requests, frame timing while panning, the heap and the open event
 * streams; at the end it turns one layer off and on. The report lists what it found wrong.
 */
export async function runScaleScenario(
  engine: MapEngine,
  drawn: readonly string[],
  options: ScaleOptions = {},
): Promise<ScaleReport> {
  const {
    steps = SCALE_STEPS,
    frameMs = STEP_FRAMES_MS,
    settleTimeoutMs = SETTLE_TIMEOUT_MS,
    measure = (target, ms) => measureFrames(target.viewer, ms),
    wait = (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
    streams = openStreams,
    heap = heapBytes,
    now = () => performance.now(),
  } = options;
  const results: ScaleStepResult[] = [];
  let maxChangeStreams = 0;
  for (const step of steps) {
    engine.viewer.camera.setView({
      destination: Cartesian3.fromDegrees(step.longitude, step.latitude, step.height),
    });
    const settled = await settle(engine, settleTimeoutMs, wait, now);
    const totals = engine.layers.totals();
    const frames = await measure(engine, frameMs);
    const open = streams();
    maxChangeStreams = Math.max(maxChangeStreams, open[CHANGE_STREAM_PATH] ?? 0);
    const used = heap();
    results.push({
      label: step.label,
      height: step.height,
      settled: settled.settled,
      settleMs: settled.ms,
      totals,
      peakRequests: settled.peak,
      frames,
      ...(used !== undefined && { heapBytes: used }),
      streams: open,
    });
  }
  const toggle = drawn.length > 0 ? await measureToggle(engine.layers, drawn) : undefined;
  const report: Omit<ScaleReport, 'problems'> = {
    at: new Date().toISOString(),
    mode: engine.viewer.scene.mode === SceneMode.SCENE3D ? '3D' : '2D',
    layers: drawn.length,
    steps: results,
    maxChangeStreams,
    ...(toggle && { toggle }),
  };
  return { ...report, problems: scaleProblems(report) };
}

/**
 * What a run found wrong, in words:
 *
 * - more than one change-stream connection open at once;
 * - a step whose layers never settled;
 * - a step whose frames missed the budget: the 95th percentile over {@link SLOW_FRAME_MS}
 *   (30 fps);
 * - with layers on, more records drawn at the closest step than the widest holds: raw records
 *   load only in view, so a city cannot hold more than the world. The world's records are those
 *   it draws one by one and those its cells count (037's clusters draw few one by one).
 */
export function scaleProblems(report: Omit<ScaleReport, 'problems'>): string[] {
  const problems: string[] = [];
  if (report.maxChangeStreams > 1) {
    problems.push(`${report.maxChangeStreams} change-stream connections were open at once.`);
  }
  for (const step of report.steps) {
    if (!step.settled) problems.push(`${step.label}: the layers did not settle.`);
    if (step.frames.frames > 1 && step.frames.p95 > SLOW_FRAME_MS) {
      problems.push(
        `${step.label}: p95 frame ${step.frames.p95.toFixed(1)} ms is over the ${SLOW_FRAME_MS.toFixed(1)} ms budget.`,
      );
    }
  }
  const widest = report.steps[0];
  const closest = report.steps.at(-1);
  if (report.layers > 0 && widest && closest && widest !== closest) {
    const held = widest.totals.features + (widest.totals.aggregated ?? 0);
    if (held > 0 && closest.totals.features > held) {
      problems.push(
        `${closest.label} drew ${closest.totals.features} records, more than ${widest.label}'s ${held}.`,
      );
    }
  }
  return problems;
}
