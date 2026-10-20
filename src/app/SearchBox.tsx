import { createElement, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Bell, FileText, MapPin, Search } from 'lucide-react';
import { prettifyId } from '../lib/labels';
import { envelopePoint } from '../objects/dossierView';
import { hitForRef } from '../objects/selectObject';
import { askProblem } from '../search/askView';
import { analysisPath } from '../intel/analysisView';
import { locateRequest } from '../search/locate';
import {
  groupResults,
  plainSnippet,
  resultRef,
  searchAll,
  searchStatus,
  type SearchGroup,
  type SearchResult,
  type SearchResults,
  type SearchStatus,
} from '../search/searchApi';
import type { Session } from './session';
import styles from './TopNav.module.css';

/** How long typing pauses before the search is sent, in milliseconds. */
export const SEARCH_DEBOUNCE_MS = 300;

/** The fewest characters worth searching for. */
export const SEARCH_MIN_CHARS = 2;

/** Each result group's heading and icon. */
const GROUPS: Record<SearchGroup, { label: string; icon: typeof MapPin }> = {
  record: { label: 'Records', icon: MapPin },
  briefing: { label: 'Briefings', icon: FileText },
  alert: { label: 'Alerts', icon: Bell },
};

/** The search box's state: idle, searching, the results, or why the search failed. */
type SearchState =
  | { status: 'idle' }
  | { status: 'searching' }
  | { status: 'ready'; results: SearchResults }
  | { status: 'error'; message: string };

/**
 * The top bar's search (017): records, briefings and alerts (`search`), sent once typing pauses,
 * dropped down grouped by type with each result's icon, title and summary. Picking one selects its
 * object (its dossier opens; 014) and moves the map to it, on the Global dashboard. Search runs in
 * hybrid mode while semantic search is ready (`getSearchStatus`) and in text mode otherwise, and the
 * drop-down says which and why.
 */
export function SearchBox({ session }: { session: Session }) {
  const { api, store } = session;
  const navigate = useNavigate();
  const location = useLocation();
  const listId = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<SearchState>({ status: 'idle' });
  const [status, setStatus] = useState<SearchStatus>();
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  // Semantic readiness, read when the box is first opened (it is open, so it needs no token).
  useEffect(() => {
    if (!open || status) return;
    const controller = new AbortController();
    searchStatus(api, controller.signal).then(setStatus, () => {});
    return () => controller.abort();
  }, [api, open, status]);

  const trimmed = query.trim();
  const semantic = status?.semanticEnabled === true && status.degraded !== true;
  useEffect(() => {
    if (trimmed.length < SEARCH_MIN_CHARS) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setState({ status: 'searching' });
      searchAll(api, trimmed, semantic, controller.signal).then(
        (results) => {
          setState({ status: 'ready', results });
          setActive(0);
        },
        (error: unknown) => {
          if (!controller.signal.aborted) {
            setState({ status: 'error', message: askProblem(error, 'Search') });
          }
        },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [api, trimmed, semantic]);

  // A click outside closes the drop-down.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const results =
    state.status === 'ready' && trimmed.length >= SEARCH_MIN_CHARS ? state.results.items : [];
  const groups = groupResults(results);
  const ordered = groups.flatMap((group) => group.items);

  /** Selects a result's object and brings the map to it. */
  const choose = async (result: SearchResult) => {
    setOpen(false);
    const ref = resultRef(result);
    // A situation or investigation opens its full-analysis view (019).
    const path = ref ? analysisPath(ref) : undefined;
    if (path) {
      await navigate(path);
      return;
    }
    const onGlobal = location.pathname.startsWith('/global');
    const fallback = result.geometry
      ? envelopePoint({ ref: '', type: 'record', title: '', geometry: result.geometry })
      : undefined;
    if (!onGlobal) await navigate('/global');
    if (ref) {
      try {
        const hit = await hitForRef(api, ref);
        store.set('selection', hit);
        // A map opening with a selection keeps its view (014); it is asked to move here instead.
        if (!onGlobal && Number.isFinite(hit.longitude)) {
          store.set('locate', locateRequest(hit.longitude, hit.latitude));
        }
        return;
      } catch {
        // The dossier did not load; the map can still go to the result's place.
      }
    }
    if (fallback) {
      store.set('locate', locateRequest(fallback[0], fallback[1]));
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (ordered.length === 0) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current) => (current + step + ordered.length) % ordered.length);
    } else if (event.key === 'Enter' && open) {
      event.preventDefault();
      void choose(ordered[active] ?? ordered[0]!);
    }
  };

  const mode =
    state.status === 'ready' && state.results.degraded
      ? `Text search: ${state.results.reason ?? 'semantic search was not available.'}`
      : status && !semantic
        ? `Text search: ${status.reason ?? 'semantic search is not ready.'}`
        : status
          ? 'Hybrid search (text and semantic)'
          : undefined;

  return (
    <div className={styles.searchBox} ref={box} data-testid="search">
      <label className={styles.search}>
        <Search size={14} aria-hidden="true" />
        <input
          type="search"
          placeholder="Search entities, locations, events…"
          aria-label="Search"
          role="combobox"
          aria-expanded={open && trimmed.length >= SEARCH_MIN_CHARS}
          aria-controls={listId}
          aria-activedescendant={ordered[active] ? `${listId}-${active}` : undefined}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
      </label>
      {open && trimmed.length >= SEARCH_MIN_CHARS && (
        <div className={styles.results} data-testid="search-results" data-state={state.status}>
          {mode && (
            <p className={styles.resultsMode} data-testid="search-mode">
              {mode}
            </p>
          )}
          {state.status === 'error' && (
            <p className={styles.resultsNote} role="alert">
              {state.message}
            </p>
          )}
          {state.status === 'searching' && <p className={styles.resultsNote}>Searching…</p>}
          {state.status === 'ready' && results.length === 0 && (
            <p className={styles.resultsNote}>Nothing found for “{trimmed}”.</p>
          )}
          <ul id={listId} role="listbox" aria-label="Search results">
            {groups.map(({ group, items }) => (
              <li key={group} role="presentation">
                <h3 className={styles.resultsGroup}>
                  {GROUPS[group].label} ({items.length})
                </h3>
                <ul role="presentation">
                  {items.map((result) => {
                    const index = ordered.indexOf(result);
                    const snippet = plainSnippet(result.snippet);
                    return (
                      <li
                        key={`${result.docType}|${result.docId}`}
                        id={`${listId}-${index}`}
                        role="option"
                        aria-selected={index === active}
                        className={styles.result}
                        onPointerDown={(event) => event.preventDefault()}
                        onClick={() => void choose(result)}
                        onPointerEnter={() => setActive(index)}
                      >
                        {createElement(GROUPS[group].icon, { size: 15, 'aria-hidden': true })}
                        <span className={styles.resultText}>
                          <span className={styles.resultTitle}>{result.title}</span>
                          {snippet && <span className={styles.resultSnippet}>{snippet}</span>}
                        </span>
                        {(result.kind ?? result.source) && (
                          <span className={styles.resultKind}>
                            {prettifyId(result.kind ?? result.source ?? '')}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
