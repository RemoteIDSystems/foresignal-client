import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import type { ForesignalClient } from '../../api/client';
import type { ChangeStream } from '../../api/stream/ChangeStream';
import { appStore, useStoreKey, type AppState, type Store } from '../../state/store';
import { HistoryPlayback } from '../../time/history';
import {
  clampInstant,
  formatHudTime,
  offsetToPosition,
  positionToOffset,
  SCRUB_MARKS,
  SCRUB_PAST_MS,
  wholeSecondIso,
} from '../../time/scrub';
import { loadHistoryFrames, loadTimeline, type Timeline } from '../../time/timeApi';
import { LiveBadge } from './LiveBadge';
import styles from './GlobalDashboard.module.css';

/** How often the histogram is read again while the page shows, in ms. */
export const TIMELINE_REFRESH_MS = 5 * 60_000;

/** How long the kinds and view must rest before the histogram is read for them, in ms. */
const TIMELINE_SETTLE_MS = 500;

/** How long each playback step shows, in ms. */
export const PLAYBACK_STEP_MS = 600;

/** How far back a playback started from live begins, in ms. */
export const PLAYBACK_DEFAULT_SPAN_MS = 6 * 3_600_000;

/** Within this much of Now on the track, a release returns to live. */
const NOW_SNAP = 0.015;

/** One arrow key's step, and one page key's, in ms. */
const KEY_STEP_MS = 10 * 60_000;
const PAGE_STEP_MS = 3_600_000;

/** Props for {@link TimeHud}. */
export interface TimeHudProps {
  api?: ForesignalClient;
  /** The live stream, for the live badge. */
  stream?: ChangeStream;
  /** The store holding `time` and `playback`. */
  store?: Store<AppState>;
  /** The kinds drawn on the map: the histogram counts them, and playback plays them. */
  kinds: readonly string[];
  /** The map's committed view, `[west, south, east, north]`; undefined for the whole world. */
  bbox?: readonly number[];
  /** The clock, for tests. */
  now?: () => number;
}

/**
 * The time machine's HUD over the map (013), as the Global mock draws it: the date-time box, the
 * live badge, and the `−24h · −6h · Now · +6h · +24h` scrubber with its handle at Now. Above the
 * track, a histogram of how many records of the drawn kinds changed in each bucket of the last day,
 * in the view (`getTimeline`), from as far back as the backend keeps history (`retainedFrom`).
 * Dragging the handle back (or the arrow keys) pins the map at that instant on release: the store's
 * `time` becomes `asOf`, and the map draws that instant's tiles. The badge then reads HISTORY;
 * clicking it, or bringing the handle back to Now, returns to live. The play button replays history
 * (`getHistoryFrames`) from the pinned instant, or from six hours ago, to now: the keyframe, then
 * each frame in order, as the store's `playback`, the handle stepping with it. The future side is
 * dimmed: no product gives forecast tracks yet. A chip says when the histogram or the frames are
 * approximate.
 */
export function TimeHud({
  api,
  stream,
  store = appStore,
  kinds,
  bbox,
  now: clock = Date.now,
}: TimeHudProps) {
  const time = useStoreKey('time', store);
  const playback = useStoreKey('playback', store);
  const [now, setNow] = useState(clock);
  const [timeline, setTimeline] = useState<Timeline>();
  const [draft, setDraft] = useState<number>();
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<string>();
  const trackRef = useRef<HTMLDivElement>(null);

  // The clock ticks each second, so the live box and the track's Now stay current.
  useEffect(() => {
    const timer = setInterval(() => setNow(clock()), 1_000);
    return () => clearInterval(timer);
  }, [clock]);

  // The histogram for the drawn kinds in the view, read once they rest and then every few minutes.
  const kindsKey = kinds.join(',');
  const bboxKey = bbox?.join(',');
  useEffect(() => {
    if (!api) return;
    const controller = new AbortController();
    const read = () => {
      const to = clock();
      loadTimeline(
        api,
        { from: to - SCRUB_PAST_MS, to },
        kindsKey ? kindsKey.split(',') : [],
        bboxKey?.split(',').map(Number),
        controller.signal,
      )
        .then(setTimeline)
        .catch((cause: unknown) => {
          if (!controller.signal.aborted)
            console.warn('ForeSignal: the timeline did not load.', cause);
        });
    };
    const settle = setTimeout(read, TIMELINE_SETTLE_MS);
    const refresh = setInterval(read, TIMELINE_REFRESH_MS);
    return () => {
      controller.abort();
      clearTimeout(settle);
      clearInterval(refresh);
    };
  }, [api, kindsKey, bboxKey, clock]);

  const earliest = timeline?.retainedFrom ? Date.parse(timeline.retainedFrom) : undefined;
  const pinned = time.mode === 'asOf' ? Date.parse(time.asOf) : undefined;
  const shown = draft ?? pinned ?? now;
  const position = offsetToPosition(shown - now);

  const goLive = useCallback(() => {
    store.batch(() => {
      store.set('playback', undefined);
      store.set('time', { mode: 'live' });
    });
  }, [store]);

  /** Pins the map at an instant, ending any playback; at Now, returns to live. */
  const commit = useCallback(
    (at: number) => {
      const current = clock();
      const instant = clampInstant(at, current, earliest);
      if (offsetToPosition(instant - current) >= 0.5 - NOW_SNAP) {
        goLive();
        return;
      }
      store.batch(() => {
        store.set('playback', undefined);
        store.set('time', { mode: 'asOf', asOf: wholeSecondIso(instant) });
      });
    },
    [clock, earliest, goLive, store],
  );

  const instantAt = (clientX: number): number => {
    const box = trackRef.current?.getBoundingClientRect();
    if (!box || box.width === 0) return now;
    const current = clock();
    return clampInstant(
      current + positionToOffset((clientX - box.left) / box.width),
      current,
      earliest,
    );
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraft(instantAt(event.clientX));
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (draft === undefined) return;
    setDraft(instantAt(event.clientX));
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (draft === undefined) return;
    const at = instantAt(event.clientX);
    setDraft(undefined);
    commit(at);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step: Record<string, number> = {
      ArrowLeft: -KEY_STEP_MS,
      ArrowDown: -KEY_STEP_MS,
      ArrowRight: KEY_STEP_MS,
      ArrowUp: KEY_STEP_MS,
      PageDown: -PAGE_STEP_MS,
      PageUp: PAGE_STEP_MS,
    };
    if (event.key === 'End') goLive();
    else if (event.key === 'Home') commit(clock() - SCRUB_PAST_MS);
    else if (event.key in step) commit((pinned ?? clock()) + step[event.key]!);
    else return;
    event.preventDefault();
  };

  // Playback steps on by itself while playing, the cursor following each step; it stops at the end.
  const playing = playback?.playing === true;
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      const current = store.get('playback');
      if (!current?.playing) return;
      const index = current.index + 1;
      const last = index >= current.history.length - 1;
      store.batch(() => {
        store.set('playback', { ...current, index, playing: !last });
        store.set('time', {
          mode: 'asOf',
          asOf: wholeSecondIso(Date.parse(current.history.timeAt(index))),
        });
      });
    }, PLAYBACK_STEP_MS);
    return () => clearInterval(timer);
  }, [playing, store]);

  const onPlay = async () => {
    if (playback) {
      const atEnd = playback.index >= playback.history.length - 1;
      store.set('playback', {
        ...playback,
        index: atEnd && !playback.playing ? 0 : playback.index,
        playing: !playback.playing,
      });
      return;
    }
    if (!api || kinds.length === 0) return;
    const to = clock();
    const from = clampInstant(pinned ?? to - PLAYBACK_DEFAULT_SPAN_MS, to, earliest);
    setLoading(true);
    setFailure(undefined);
    try {
      const frames = await loadHistoryFrames(api, { from, to }, kinds, bbox);
      const history = new HistoryPlayback(frames);
      store.batch(() => {
        store.set('playback', { history, index: 0, playing: true });
        store.set('time', { mode: 'asOf', asOf: wholeSecondIso(Date.parse(history.timeAt(0))) });
      });
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : 'History did not load.');
    } finally {
      setLoading(false);
    }
  };

  const approximate = [
    timeline?.approximate && 'the histogram counts are estimates',
    playback?.history.approximate && 'the history frames are approximate',
  ].filter(Boolean);
  const canPlay = api !== undefined && (kinds.length > 0 || playback !== undefined);
  const label = formatHudTime(shown);

  return (
    <div className={styles.hudTime}>
      <div className={styles.hudTimeRow}>
        <span className={styles.hudBox} data-testid="hud-time">
          {label}
        </span>
        {time.mode === 'asOf' ? (
          <button
            type="button"
            className={styles.live}
            data-state="history"
            data-testid="time-mode"
            title={`Showing the map as of ${label}. Click to return to live.`}
            aria-label="Return to live"
            onClick={goLive}
          >
            ◆ HISTORY
          </button>
        ) : (
          <LiveBadge stream={stream} />
        )}
        <button
          type="button"
          className={styles.playButton}
          aria-label={playing ? 'Pause playback' : 'Play history'}
          title={
            failure ??
            (playing
              ? 'Pause playback'
              : kinds.length === 0 && !playback
                ? 'Turn on a record layer to play its history'
                : 'Play history from the pinned instant (or six hours ago) to now')
          }
          data-state={loading ? 'loading' : playing ? 'playing' : playback ? 'paused' : 'idle'}
          disabled={!canPlay || loading}
          onClick={() => void onPlay()}
        >
          {playing ? '❚❚' : '›'}
        </button>
        {playback && (
          <span className={styles.scrubberStep} data-testid="playback-step">
            Frame {playback.index + 1} of {playback.history.length}
          </span>
        )}
        {approximate.length > 0 && (
          <span
            className={styles.scrubberNote}
            data-testid="time-approximate"
            title={`Approximate: ${approximate.join('; ')}.`}
          >
            ≈ Approximate
          </span>
        )}
      </div>
      <div className={styles.scrubber}>
        <div
          ref={trackRef}
          className={styles.scrubberArea}
          role="slider"
          tabIndex={0}
          aria-label="Time"
          aria-valuemin={-24}
          aria-valuemax={0}
          aria-valuenow={Math.round(((shown - now) / 3_600_000) * 100) / 100}
          aria-valuetext={time.mode === 'live' && draft === undefined ? 'Now (live)' : label}
          data-testid="time-scrubber"
          data-position={position.toFixed(4)}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => setDraft(undefined)}
          onKeyDown={onKeyDown}
        >
          <Histogram timeline={timeline} now={now} earliest={earliest} />
          <div className={styles.scrubberTrack}>
            <span className={styles.scrubberFill} style={{ width: `${position * 100}%` }} />
            {SCRUB_MARKS.map((mark) => (
              <span
                key={mark.label}
                className={styles.scrubberTick}
                style={{ left: `${mark.at * 100}%` }}
              />
            ))}
            <span
              className={styles.scrubberFuture}
              title="No forecast tracks for the layers on the map"
            />
            <span className={styles.scrubberThumb} style={{ left: `${position * 100}%` }} />
          </div>
        </div>
        <div className={styles.scrubberLabels}>
          {SCRUB_MARKS.map((mark) => (
            <span key={mark.label}>{mark.label}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Histogram bar area height, in the SVG's units (pixels). */
const BAR_HEIGHT = 14;

/**
 * The density histogram above the scrubber's track: one bar per bucket, as tall as its count
 * against the busiest bucket, at the bucket's place on the track. Time before `earliest` (history
 * not kept) is shaded.
 */
function Histogram({
  timeline,
  now,
  earliest,
}: {
  timeline: Timeline | undefined;
  now: number;
  earliest: number | undefined;
}) {
  const buckets = timeline?.buckets ?? [];
  const max = Math.max(1, timeline?.maxBucket ?? 0, ...buckets.map((bucket) => bucket.total));
  const lost =
    earliest !== undefined && earliest > now - SCRUB_PAST_MS ? offsetToPosition(earliest - now) : 0;
  return (
    <svg
      className={styles.histogram}
      viewBox={`0 0 1 ${BAR_HEIGHT}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      data-testid="time-histogram"
      data-buckets={buckets.length}
    >
      {lost > 0 && (
        <rect x={0} y={0} width={lost} height={BAR_HEIGHT} className={styles.histogramLost} />
      )}
      {buckets.map((bucket, i) => {
        const start = Date.parse(bucket.t);
        const end = Date.parse(buckets[i + 1]?.t ?? timeline?.to ?? bucket.t);
        const x = offsetToPosition(start - now);
        // The track is piecewise: a bucket is wider in the six hours before Now than before that.
        const width = Math.max(0, offsetToPosition(end - now) - x);
        const height = (bucket.total / max) * BAR_HEIGHT;
        return (
          <rect
            key={bucket.t}
            x={x}
            y={BAR_HEIGHT - height}
            width={width}
            height={height}
            className={styles.histogramBar}
          />
        );
      })}
    </svg>
  );
}
