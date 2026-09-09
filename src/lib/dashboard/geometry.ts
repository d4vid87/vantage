import { pointInPolygon, bboxOf } from "../aoi";
import { asRecord, finite } from "./types";
export function polygonGeometry(
  value: unknown,
): GeoJSON.Polygon | GeoJSON.MultiPolygon | null {
  const g = asRecord(value);
  if (
    !["Polygon", "MultiPolygon"].includes(String(g.type)) ||
    !Array.isArray(g.coordinates)
  )
    return null;
  const polygons = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  let count = 0;
  for (const p of polygons) {
    if (!Array.isArray(p) || !p.length) return null;
    for (const ring of p) {
      if (!Array.isArray(ring) || ring.length < 4) return null;
      for (const c of ring) {
        if (
          ++count > 100000 ||
          !Array.isArray(c) ||
          !finite(c[0]) ||
          !finite(c[1]) ||
          Math.abs(c[0]) > 180 ||
          Math.abs(c[1]) > 90
        )
          return null;
      }
      const unwrapped = unwrap(ring, ring[0][0]);
      const area = unwrapped
        .slice(1)
        .reduce(
          (sum, p, i) => sum + unwrapped[i][0] * p[1] - p[0] * unwrapped[i][1],
          0,
        );
      if (Math.abs(area) < 1e-12) return null;
      if (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1])
        return null;
    }
  }
  return g as unknown as GeoJSON.Polygon | GeoJSON.MultiPolygon;
}
function unwrap(ring: number[][], anchor: number) {
  let previous = anchor;
  return ring.map(([x, y]) => {
    while (x - previous > 180) x -= 360;
    while (x - previous < -180) x += 360;
    previous = x;
    return [x, y];
  });
}
function onSegment(p: number[], a: number[], b: number[]) {
  return (
    Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) <
      1e-9 &&
    p[0] >= Math.min(a[0], b[0]) - 1e-9 &&
    p[0] <= Math.max(a[0], b[0]) + 1e-9 &&
    p[1] >= Math.min(a[1], b[1]) - 1e-9 &&
    p[1] <= Math.max(a[1], b[1]) + 1e-9
  );
}
function contains(p: number[], ring: number[][]) {
  return (
    ring.some((a, i) => i > 0 && onSegment(p, ring[i - 1], a)) ||
    pointInPolygon(p[0], p[1], ring)
  );
}
function intersects(a: number[], b: number[], c: number[], d: number[]) {
  const cross = (p: number[], q: number[], r: number[]) =>
    (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  return (
    (cross(a, b, c) * cross(a, b, d) < 0 &&
      cross(c, d, a) * cross(c, d, b) < 0) ||
    onSegment(a, c, d) ||
    onSegment(b, c, d) ||
    onSegment(c, a, b) ||
    onSegment(d, a, b)
  );
}
export function inGeometry(
  lng: number,
  lat: number,
  g: GeoJSON.Polygon | GeoJSON.MultiPolygon,
) {
  const polygons = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  return polygons.some((rings) => {
    const rr = rings.map((r) => unwrap(r, lng));
    return (
      contains([lng, lat], rr[0]) &&
      !rr.slice(1).some((r) => contains([lng, lat], r))
    );
  });
}
export function intersectsGeometry(
  ring: number[][],
  g: GeoJSON.Polygon | GeoJSON.MultiPolygon,
) {
  const a = unwrap(ring, ring[0][0]);
  const bounds = bboxOf(a);
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  return polys.some((rings) => {
    const rr = rings.map((r) => unwrap(r, a[0][0]));
    const other = bboxOf(rr[0]);
    if (
      bounds.east < other.west ||
      bounds.west > other.east ||
      bounds.north < other.south ||
      bounds.south > other.north
    )
      return false;
    if (
      a.some(
        (p) =>
          contains(p, rr[0]) && !rr.slice(1).some((hole) => contains(p, hole)),
      )
    )
      return true;
    if (rr[0].some((p) => contains(p, a))) return true;
    return rr.some((r) =>
      r.some(
        (b, j) =>
          j > 0 &&
          a.some((c, i) => i > 0 && intersects(a[i - 1], c, r[j - 1], b)),
      ),
    );
  });
}
