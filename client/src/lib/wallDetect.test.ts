import { describe, it, expect } from 'vitest';
import {
  detectAssemblyType, matchCalibratedType, nearestWallColorAt,
  ProjectCalibration, WallStroke,
} from './wallDetect';

// A vertical wall segment at x=col (percent), y from 50..60.
function vStroke(col: number, rgb: [number, number, number]): WallStroke {
  return { rgb, width: 30, points: [col, 50, col, 60], bbox: [col, 50, col, 60] };
}

const cal: ProjectCalibration = {
  calibrated: true,
  types: {
    '1hr_fire': { rgb: [255, 0, 0], width: 30 },     // red
    'smoke_barrier': { rgb: [0, 255, 0], width: 30 }, // green
    '3hr_fire': 'na',
  },
};

describe('matchCalibratedType', () => {
  it('matches the nearest calibrated color within tolerance', () => {
    expect(matchCalibratedType([250, 5, 5], cal, 60)).toBe('1hr_fire');
    expect(matchCalibratedType([5, 250, 5], cal, 60)).toBe('smoke_barrier');
  });
  it('returns null when no color is within tolerance', () => {
    expect(matchCalibratedType([0, 0, 255], cal, 60)).toBeNull(); // blue, uncalibrated
  });
  it('ignores N/A entries', () => {
    const naCal: ProjectCalibration = { calibrated: true, types: { '3hr_fire': 'na' } };
    expect(matchCalibratedType([255, 0, 0], naCal, 60)).toBeNull();
  });
});

describe('nearestWallColorAt', () => {
  it('returns the closest stroke color within radius', () => {
    const strokes = [vStroke(50, [255, 0, 0]), vStroke(60, [0, 255, 0])];
    const hit = nearestWallColorAt(strokes, 50.4, 55, 1.2);
    expect(hit?.rgb).toEqual([255, 0, 0]);
  });
  it('returns null when nothing is within radius', () => {
    const strokes = [vStroke(50, [255, 0, 0])];
    expect(nearestWallColorAt(strokes, 10, 10, 1.2)).toBeNull();
  });
});

describe('detectAssemblyType', () => {
  it('fire wins over smoke when both run parallel near the drop', () => {
    // red (1hr_fire) at x=50 and green (smoke_barrier) at x=51, drop between them.
    const strokes = [vStroke(50, [255, 0, 0]), vStroke(51, [0, 255, 0])];
    const t = detectAssemblyType(strokes, 50.5, 55, cal, { radiusPct: 1.2, tolerance: 60 });
    expect(t).toBe('1hr_fire');
  });

  it('assigns smoke when only the smoke line is close enough', () => {
    const strokes = [vStroke(50, [255, 0, 0]), vStroke(51, [0, 255, 0])];
    // Tight radius so only the green line (x=51) qualifies.
    const t = detectAssemblyType(strokes, 51, 55, cal, { radiusPct: 0.6, tolerance: 60 });
    expect(t).toBe('smoke_barrier');
  });

  it('returns null when no calibrated line is near the drop', () => {
    const strokes = [vStroke(50, [255, 0, 0])];
    expect(detectAssemblyType(strokes, 10, 10, cal, { radiusPct: 1.2, tolerance: 60 })).toBeNull();
  });

  it('returns null when the project is not calibrated', () => {
    const uncal: ProjectCalibration = { ...cal, calibrated: false };
    const strokes = [vStroke(50, [255, 0, 0])];
    expect(detectAssemblyType(strokes, 50, 55, uncal, { radiusPct: 1.2, tolerance: 60 })).toBeNull();
  });
});
