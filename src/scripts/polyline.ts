/** Decode a Google encoded polyline – runs in sync, build and browser. */

/** A point as [latitude, longitude] in degrees. */
export type LatLng = [lat: number, lng: number];

/** Google encoded polyline → [[lat,lng], …]; nothing for an empty or missing polyline. */
export function decodePolyline(str: string | null | undefined): LatLng[] {
  if (!str) return [];
  let i = 0, lat = 0, lng = 0;
  const out: LatLng[] = [];
  while (i < str.length) {
    let b, shift = 0, res = 0;
    do { b = str.charCodeAt(i++) - 63; res |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20 && i < str.length);
    lat += res & 1 ? ~(res >> 1) : res >> 1;
    shift = 0; res = 0;
    do { b = str.charCodeAt(i++) - 63; res |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20 && i < str.length);
    lng += res & 1 ? ~(res >> 1) : res >> 1;
    out.push([lat / 1e5, lng / 1e5]);
  }
  return out;
}
