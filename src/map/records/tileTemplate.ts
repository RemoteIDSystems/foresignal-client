/** A record tile template from a layer's TileJSON, reduced to what `getTile` takes. */
export interface RecordTileTemplate {
  /** The `layer` path parameter. */
  layer: string;
  /** The template's query parameters `getTile` accepts (`asOf`, `agg`, `ticket`). */
  query: { asOf?: string; agg?: 'auto' | 'none' | 'grid' | 'hex'; ticket?: string };
}

const TILE_PATH = /\/v1\/tiles\/([^/]+)\/\{z\}\/\{x\}\/\{y\}\.mvt$/;
const AGG_VALUES = new Set(['auto', 'none', 'grid', 'hex']);
/** Time aliases a template must never carry: the layer would change under a fixed URL. */
const ALIASES = new Set(['latest', 'now']);

/**
 * Reads a TileJSON `tiles` template (`…/v1/tiles/{layer}/{z}/{x}/{y}.mvt[?asOf=…]`) into the
 * `getTile` path and query. The template's host is ignored: the request goes through the API
 * client, to its own backend with its credentials, whatever public URL the backend advertises.
 * Returns undefined for a template of another shape, or one whose `asOf` is an alias such as
 * `latest` rather than a concrete instant.
 */
export function parseTileTemplate(template: string): RecordTileTemplate | undefined {
  let url: URL;
  try {
    url = new URL(template, 'http://template.invalid');
  } catch {
    return undefined;
  }
  const match = TILE_PATH.exec(decodeURI(url.pathname));
  const layer = match?.[1];
  if (!layer) return undefined;
  const query: RecordTileTemplate['query'] = {};
  const asOf = url.searchParams.get('asOf');
  if (asOf !== null) {
    if (ALIASES.has(asOf.toLowerCase())) return undefined;
    query.asOf = asOf;
  }
  const agg = url.searchParams.get('agg');
  if (agg !== null && AGG_VALUES.has(agg)) query.agg = agg as RecordTileTemplate['query']['agg'];
  const ticket = url.searchParams.get('ticket');
  if (ticket !== null) query.ticket = ticket;
  return { layer: decodeURIComponent(layer), query };
}
