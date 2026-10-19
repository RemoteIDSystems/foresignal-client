/**
 * Encoder (and a test decoder) for Cesium's quantized-mesh-1.0 terrain tiles.
 *
 * Layout, little-endian, as read by Cesium's `CesiumTerrainProvider` (`createQuantizedMeshTerrainData`):
 *
 * 1. Header, 88 bytes: center (3 × f64, ECEF), minimum and maximum height (2 × f32), bounding sphere
 *    (4 × f64) and horizon occlusion point (3 × f64, ellipsoid-scaled ECEF).
 * 2. Vertices: a u32 count, then u, v and height as three u16 arrays (0–32767), each zig-zag delta
 *    encoded.
 * 3. Triangles: padded to the index size, a u32 count, then indices (u16, or u32 above 65,536
 *    vertices) in high-water-mark encoding.
 * 4. Edge vertices: west, south, east and north lists, each a u32 count then plain indices.
 * 5. Extensions: none are written. Vertex normals (`octvertexnormals`) are left out on purpose:
 *    when a tile has them, Cesium lights the globe per vertex instead of with day/night shading, and
 *    day/night shading is what blends the night-lights layer onto only the night side
 *    (`@cesium/engine` `GlobeSurfaceShaderSet.js`, `GlobeFS.glsl`).
 */

/** Largest quantized u, v or height value. */
export const QUANTIZED_MAX = 32767;

/** Zig-zag delta encodes values in place order: each output is the zig-zagged change from the last. */
export function zigZagDeltaEncode(values) {
  const out = new Uint16Array(values.length);
  let previous = 0;
  for (let i = 0; i < values.length; i++) {
    const delta = values[i] - previous;
    out[i] = (delta << 1) ^ (delta >> 31);
    previous = values[i];
  }
  return out;
}

/** Reverses {@link zigZagDeltaEncode}. */
export function zigZagDeltaDecode(encoded) {
  const out = new Uint16Array(encoded.length);
  let value = 0;
  for (let i = 0; i < encoded.length; i++) {
    const zz = encoded[i];
    value += (zz >> 1) ^ -(zz & 1);
    out[i] = value;
  }
  return out;
}

/**
 * High-water-mark encodes triangle indices. Requires every index to first appear in increasing
 * order (0, 1, 2, …); {@link reorderForHighWaterMark} arranges that.
 */
export function highWaterMarkEncode(indices) {
  const out = new Uint32Array(indices.length);
  let highest = 0;
  for (let i = 0; i < indices.length; i++) {
    const index = indices[i];
    if (index > highest) throw new Error(`Index ${index} appears before ${highest}.`);
    out[i] = highest - index;
    if (index === highest) highest++;
  }
  return out;
}

/** Reverses {@link highWaterMarkEncode}, exactly as Cesium does. */
export function highWaterMarkDecode(encoded) {
  const out = new Uint32Array(encoded.length);
  let highest = 0;
  for (let i = 0; i < encoded.length; i++) {
    const code = encoded[i];
    out[i] = highest - code;
    if (code === 0) highest++;
  }
  return out;
}

/**
 * Renumbers vertices in the order the triangles first use them, so the triangle list can be
 * high-water-mark encoded. Returns the new-to-old vertex map and the renumbered triangles.
 */
export function reorderForHighWaterMark(vertexCount, triangles) {
  const oldToNew = new Int32Array(vertexCount).fill(-1);
  const newToOld = [];
  const renumbered = new Uint32Array(triangles.length);
  for (let i = 0; i < triangles.length; i++) {
    const old = triangles[i];
    if (oldToNew[old] < 0) {
      oldToNew[old] = newToOld.length;
      newToOld.push(old);
    }
    renumbered[i] = oldToNew[old];
  }
  if (newToOld.length !== vertexCount) throw new Error('A vertex is not used by any triangle.');
  return { newToOld: Uint32Array.from(newToOld), triangles: renumbered };
}

/**
 * Encodes one tile.
 *
 * @param {object} tile
 * @param {number[]} tile.center ECEF center, meters.
 * @param {number} tile.minimumHeight Lowest height, meters.
 * @param {number} tile.maximumHeight Highest height, meters.
 * @param {number[]} tile.boundingSphere `[x, y, z, radius]`, meters.
 * @param {number[]} tile.horizonOcclusionPoint Ellipsoid-scaled ECEF.
 * @param {Uint16Array} tile.u Quantized u (west 0 → east 32767), in high-water-mark order.
 * @param {Uint16Array} tile.v Quantized v (south 0 → north 32767).
 * @param {Uint16Array} tile.height Quantized height (minimum 0 → maximum 32767).
 * @param {Uint32Array} tile.triangles Vertex indices, three per triangle, counter-clockwise in u/v.
 * @returns {Uint8Array} The tile's bytes.
 */
export function encodeTile(tile) {
  const vertexCount = tile.u.length;
  const wide = vertexCount > 64 * 1024;
  const indexBytes = wide ? 4 : 2;
  const edges = ['west', 'south', 'east', 'north'].map((side) => edgeIndices(tile, side));
  let size = 88 + 4 + vertexCount * 6;
  size += (indexBytes - (size % indexBytes)) % indexBytes;
  size += 4 + tile.triangles.length * indexBytes;
  for (const edge of edges) size += 4 + edge.length * indexBytes;

  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  let pos = 0;
  const f64 = (value) => {
    view.setFloat64(pos, value, true);
    pos += 8;
  };
  const u32 = (value) => {
    view.setUint32(pos, value, true);
    pos += 4;
  };
  const index = (value) => {
    if (wide) view.setUint32(pos, value, true);
    else view.setUint16(pos, value, true);
    pos += indexBytes;
  };

  tile.center.forEach(f64);
  view.setFloat32(pos, tile.minimumHeight, true);
  view.setFloat32(pos + 4, tile.maximumHeight, true);
  pos += 8;
  tile.boundingSphere.forEach(f64);
  tile.horizonOcclusionPoint.forEach(f64);

  u32(vertexCount);
  for (const array of [tile.u, tile.v, tile.height]) {
    for (const value of zigZagDeltaEncode(array)) {
      view.setUint16(pos, value, true);
      pos += 2;
    }
  }
  pos += (indexBytes - (pos % indexBytes)) % indexBytes;

  u32(tile.triangles.length / 3);
  highWaterMarkEncode(tile.triangles).forEach(index);
  for (const edge of edges) {
    u32(edge.length);
    edge.forEach(index);
  }

  if (pos !== size) throw new Error(`Wrote ${pos} of ${size} bytes.`);
  return bytes;
}

/** The vertices on one edge of the tile, by quantized coordinate. */
function edgeIndices(tile, side) {
  const out = [];
  for (let i = 0; i < tile.u.length; i++) {
    if (
      (side === 'west' && tile.u[i] === 0) ||
      (side === 'east' && tile.u[i] === QUANTIZED_MAX) ||
      (side === 'south' && tile.v[i] === 0) ||
      (side === 'north' && tile.v[i] === QUANTIZED_MAX)
    ) {
      out.push(i);
    }
  }
  return out;
}

/**
 * Decodes a tile the way Cesium's `createQuantizedMeshTerrainData` does. Used by the tests and by
 * the build's self-check; the client never decodes tiles itself.
 */
export function decodeTile(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let pos = 0;
  const f64 = () => {
    const value = view.getFloat64(pos, true);
    pos += 8;
    return value;
  };
  const u32 = () => {
    const value = view.getUint32(pos, true);
    pos += 4;
    return value;
  };
  const center = [f64(), f64(), f64()];
  const minimumHeight = view.getFloat32(pos, true);
  const maximumHeight = view.getFloat32(pos + 4, true);
  pos += 8;
  const boundingSphere = [f64(), f64(), f64(), f64()];
  const horizonOcclusionPoint = [f64(), f64(), f64()];
  const vertexCount = u32();
  const read16 = (count) => {
    const out = new Uint16Array(count);
    for (let i = 0; i < count; i++, pos += 2) out[i] = view.getUint16(pos, true);
    return out;
  };
  const u = zigZagDeltaDecode(read16(vertexCount));
  const v = zigZagDeltaDecode(read16(vertexCount));
  const height = zigZagDeltaDecode(read16(vertexCount));
  const indexBytes = vertexCount > 64 * 1024 ? 4 : 2;
  pos += (indexBytes - (pos % indexBytes)) % indexBytes;
  const readIndices = (count) => {
    const out = new Uint32Array(count);
    for (let i = 0; i < count; i++, pos += indexBytes) {
      out[i] = indexBytes === 4 ? view.getUint32(pos, true) : view.getUint16(pos, true);
    }
    return out;
  };
  const triangles = highWaterMarkDecode(readIndices(u32() * 3));
  const edges = {};
  for (const side of ['west', 'south', 'east', 'north']) edges[side] = readIndices(u32());
  const extensions = {};
  while (pos < view.byteLength) {
    const id = view.getUint8(pos);
    const length = view.getUint32(pos + 1, true);
    pos += 5;
    extensions[id] = new Uint8Array(buffer.buffer, buffer.byteOffset + pos, length);
    pos += length;
  }
  return {
    center,
    minimumHeight,
    maximumHeight,
    boundingSphere,
    horizonOcclusionPoint,
    u,
    v,
    height,
    triangles,
    edges,
    extensions,
  };
}
