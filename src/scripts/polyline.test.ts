import { describe, it, expect } from 'vitest';
import { decodePolyline } from './polyline.ts';

describe('decodePolyline', () => {
  it('decodes the Google reference example', () => {
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual([[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]]);
  });
  it('returns an empty list for empty input', () => {
    expect(decodePolyline('')).toEqual([]);
    expect(decodePolyline(null)).toEqual([]);
  });
});
