/**
 * A canonical object reference, `{type}:{id}` (`situation:01JA8Q…`, `record:usgs-earthquakes/nc1`),
 * read into its parts. A record ref's id is `{sourceId}/{externalId}[@{seq}]` with the external
 * id percent-encoded; `record` holds those decoded.
 */
export interface ObjectRefParts {
  type: string;
  id: string;
  record?: { sourceId: string; externalId: string; seq?: number };
}

const TYPE = /^[a-z][a-z0-9-]*$/;

/**
 * Reads a canonical ref into its type and id (and, for a record, its source, external id and
 * version seq). Returns undefined for a string that is not `{type}:{id}`, or a record ref without
 * a source and an id.
 */
export function parseObjectRef(ref: string): ObjectRefParts | undefined {
  const colon = ref.indexOf(':');
  if (colon <= 0 || colon === ref.length - 1) return undefined;
  const type = ref.slice(0, colon);
  const id = ref.slice(colon + 1);
  if (!TYPE.test(type)) return undefined;
  if (type !== 'record') return { type, id };
  const slash = id.indexOf('/');
  if (slash <= 0 || slash === id.length - 1) return undefined;
  const sourceId = id.slice(0, slash);
  let rest = id.slice(slash + 1);
  let seq: number | undefined;
  const at = rest.lastIndexOf('@');
  if (at > 0 && /^\d+$/.test(rest.slice(at + 1))) {
    seq = Number(rest.slice(at + 1));
    rest = rest.slice(0, at);
  }
  let externalId: string;
  try {
    externalId = decodeURIComponent(rest);
  } catch {
    return undefined;
  }
  return { type, id, record: { sourceId, externalId, ...(seq !== undefined && { seq }) } };
}

/** A ref from its type and id: `{type}:{id}`. */
export function formatObjectRef(type: string, id: string): string {
  return `${type}:${id}`;
}

/**
 * A record's canonical ref, `record:{sourceId}/{externalId}[@{seq}]`, the external id
 * percent-encoded so a `/`, `@` or `%` in it cannot be read as a separator.
 */
export function recordRef(sourceId: string, externalId: string, seq?: number): string {
  return formatObjectRef(
    'record',
    `${sourceId}/${encodeURIComponent(externalId)}${seq !== undefined ? `@${seq}` : ''}`,
  );
}

/**
 * A ref as one URL path segment, percent-encoded whole (`record:a%2Fb` for `record:a/b`). The API
 * client does this itself for a `{ref}` path parameter; this is for building a link by hand.
 */
export function refPathSegment(ref: string): string {
  return encodeURIComponent(ref);
}
