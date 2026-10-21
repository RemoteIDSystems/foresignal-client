import type { ForesignalClient } from '../api/client';
import { unwrap } from '../api/client';
import type { components } from '../api/generated/schema';

/** A saved view (`SavedView`). */
export type SavedView = components['schemas']['SavedView'];

/** A saved view as written (`SavedViewInput`). */
export type SavedViewInput = components['schemas']['SavedViewInput'];

/** A named place, an area of interest (`Place`). */
export type Place = components['schemas']['Place'];

/** A place as written (`PlaceInput`). */
export type PlaceInput = components['schemas']['PlaceInput'];

/** A place's weather (`PlaceWeatherResponse`). */
export type PlaceWeather = components['schemas']['PlaceWeatherResponse'];

/** A watchlist (`Watchlist`). */
export type Watchlist = components['schemas']['Watchlist'];

/** A watchlist as written (`WatchlistInput`). */
export type WatchlistInput = components['schemas']['WatchlistInput'];

/** One watchlist entry (`WatchlistItem`). */
export type WatchlistItem = components['schemas']['WatchlistItem'];

/** One watchlist entry as written (`WatchlistItemInput`). */
export type WatchlistItemInput = components['schemas']['WatchlistItemInput'];

/** What adding items did (`WatchlistImportResult`). */
export type WatchlistImportResult = components['schemas']['WatchlistImportResult'];

/** A record as listed (`Record`). */
export type ViewRecord = components['schemas']['Record'];

/** How many of each list a page holds. */
export const SAVED_PAGE = 200;

/** The saved views (`listViews`), an open read. */
export async function listViews(api: ForesignalClient, signal?: AbortSignal): Promise<SavedView[]> {
  const page = await unwrap(
    api.GET('/v1/views', { params: { query: { limit: SAVED_PAGE } }, signal }),
  );
  return page.items;
}

/** One saved view (`getView`). */
export function getView(
  api: ForesignalClient,
  viewId: string,
  signal?: AbortSignal,
): Promise<SavedView> {
  return unwrap(api.GET('/v1/views/{viewId}', { params: { path: { viewId } }, signal }));
}

/** Saves a view (`createView`); needs `agent` scope. */
export function createView(api: ForesignalClient, view: SavedViewInput): Promise<SavedView> {
  return unwrap(api.POST('/v1/views', { body: view }));
}

/** The current records a view matches, first page, as JSON (`getViewRecords`). */
export async function getViewRecords(
  api: ForesignalClient,
  viewId: string,
  limit = 50,
  signal?: AbortSignal,
): Promise<ViewRecord[]> {
  const page = await unwrap(
    api.GET('/v1/views/{viewId}/records', {
      params: { path: { viewId }, query: { limit } },
      headers: { Accept: 'application/json' },
      signal,
    }),
  );
  // The operation also answers GeoJSON and text formats; JSON is asked for.
  return (page as components['schemas']['RecordPage']).items;
}

/** The places (`listPlaces`); places always need a token. */
export async function listPlaces(api: ForesignalClient, signal?: AbortSignal): Promise<Place[]> {
  const page = await unwrap(
    api.GET('/v1/places', { params: { query: { limit: SAVED_PAGE } }, signal }),
  );
  return page.items;
}

/** One place (`getPlace`). */
export function getPlace(
  api: ForesignalClient,
  placeId: string,
  signal?: AbortSignal,
): Promise<Place> {
  return unwrap(api.GET('/v1/places/{placeId}', { params: { path: { placeId } }, signal }));
}

/** Creates a place (`createPlace`); needs `agent` scope. */
export function createPlace(api: ForesignalClient, place: PlaceInput): Promise<Place> {
  return unwrap(api.POST('/v1/places', { body: place }));
}

/** A place's weather record and forecast series (`getPlaceWeather`). */
export function getPlaceWeather(
  api: ForesignalClient,
  placeId: string,
  signal?: AbortSignal,
): Promise<PlaceWeather> {
  return unwrap(api.GET('/v1/places/{placeId}/weather', { params: { path: { placeId } }, signal }));
}

/** The watchlists with their item counts (`listWatchlists`); needs `agent` scope. */
export async function listWatchlists(
  api: ForesignalClient,
  signal?: AbortSignal,
): Promise<Watchlist[]> {
  const page = await unwrap(
    api.GET('/v1/watchlists', { params: { query: { limit: SAVED_PAGE } }, signal }),
  );
  return page.items;
}

/** Creates a watchlist (`createWatchlist`). */
export function createWatchlist(api: ForesignalClient, list: WatchlistInput): Promise<Watchlist> {
  return unwrap(api.POST('/v1/watchlists', { body: list }));
}

/** A watchlist's items, first page by value (`listWatchlistItems`). */
export async function listWatchlistItems(
  api: ForesignalClient,
  watchlistId: string,
  signal?: AbortSignal,
): Promise<WatchlistItem[]> {
  const page = await unwrap(
    api.GET('/v1/watchlists/{watchlistId}/items', {
      params: { path: { watchlistId }, query: { limit: SAVED_PAGE } },
      signal,
    }),
  );
  return page.items;
}

/** Adds or updates items, normalized by the list's identity (`addWatchlistItems`). */
export function addWatchlistItems(
  api: ForesignalClient,
  watchlistId: string,
  items: WatchlistItemInput[],
): Promise<WatchlistImportResult> {
  return unwrap(
    api.POST('/v1/watchlists/{watchlistId}/items', {
      params: { path: { watchlistId } },
      body: { items },
    }),
  );
}
