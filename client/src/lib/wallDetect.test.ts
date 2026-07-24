import { describe, it, expect } from 'vitest';
import {
  detectAssemblyType, detectAssemblyTypeWithConfidence, matchCalibratedType,
  nearestWallColorAt, styleAt, ProjectCalibration, WallStroke, RGB,
} from './wallDetect';

// A vertical wall as one segment at x=col (percent), y 50..60.
function line(col: number, rgb: RGB): WallStroke {
  return { rgb, width: 30, segments: [[col, 50, col, 60]], bbox: [col, 50, col, 60] };
}
// Solid line near y=55: two connected segments (continuous ink).
function solid(col: number, rgb: RGB): WallStroke {
  return { rgb, width: 30, segments: [[col, 54, col, 55], [col, 55, col, 56]], bbox: [col, 54, col, 56] };
}
// Dashed line near y=55: short dashes with equal gaps.
function dashed(col: number, rgb: RGB): WallStroke {
  return {
    rgb, width: 30,
    segments: [[col, 54.4, col, 54.6], [col, 54.8, col, 55.0], [col, 55.2, col, 55.4], [col, 55.6, col, 55.8]],
    bbox: [col, 54.4, col, 55.8],
  };
}

// A horizontal wall at height y, x 45..55.
function hline(y: number, rgb: RGB): WallStroke {
  return { rgb, width: 30, segments: [[45, y, 55, y]], bbox: [45, y, 55, y] };
}

const RED: RGB = [255, 0, 0];
const GREEN: RGB = [0, 255, 0];
const BLUE: RGB = [110, 138, 221];

const cal: ProjectCalibration = {
  calibrated: true,
  types: {
    '1hr_fire': { rgb: RED, width: 30 },
    'smoke_barrier': { rgb: GREEN, width: 30 },
    '3hr_fire': 'na',
  },
};

// Two assembly types drawn in the SAME blue, distinguished by line style.
const styleCal: ProjectCalibration = {
  calibrated: true,
  types: {
    '1hr_partition': { rgb: BLUE, width: 30, style: 'solid' },
    'smoke_barrier': { rgb: BLUE, width: 30, style: 'dashed' },
  },
};

describe('matchCalibratedType', () => {
  it('matches the nearest calibrated color within tolerance', () => {
    expect(matchCalibratedType([250, 5, 5], cal, 60)).toBe('1hr_fire');
    expect(matchCalibratedType([5, 250, 5], cal, 60)).toBe('smoke_barrier');
  });
  it('returns null when no color is within tolerance', () => {
    expect(matchCalibratedType([0, 0, 255], cal, 60)).toBeNull();
  });
});

describe('nearestWallColorAt', () => {
  it('returns the closest stroke color within radius', () => {
    const strokes = [line(50, RED), line(60, GREEN)];
    expect(nearestWallColorAt(strokes, 50.4, 55, 1.2)?.rgb).toEqual(RED);
  });
  it('returns null when nothing is within radius', () => {
    expect(nearestWallColorAt([line(50, RED)], 10, 10, 1.2)).toBeNull();
  });
});

describe('styleAt', () => {
  it('reads a continuous line as solid', () => {
    expect(styleAt([solid(50, BLUE)], BLUE, 50, 55, 60)).toBe('solid');
  });
  it('reads a broken (gapped) line as dashed', () => {
    expect(styleAt([dashed(50, BLUE)], BLUE, 50, 55, 60)).toBe('dashed');
  });
});

describe('detectAssemblyType', () => {
  it('fire wins over smoke when both run parallel near the drop', () => {
    const strokes = [line(50, RED), line(51, GREEN)];
    expect(detectAssemblyType(strokes, 50.5, 55, cal, { radiusPct: 1.2, tolerance: 60 })).toBe('1hr_fire');
  });

  it('assigns smoke when only the smoke line is close enough', () => {
    const strokes = [line(50, RED), line(51, GREEN)];
    expect(detectAssemblyType(strokes, 51, 55, cal, { radiusPct: 0.6, tolerance: 60 })).toBe('smoke_barrier');
  });

  it('returns null when no calibrated line is near the drop', () => {
    expect(detectAssemblyType([line(50, RED)], 10, 10, cal, { radiusPct: 1.2, tolerance: 60 })).toBeNull();
  });

  it('returns null when the project is not calibrated', () => {
    const uncal: ProjectCalibration = { ...cal, calibrated: false };
    expect(detectAssemblyType([line(50, RED)], 50, 55, uncal, { radiusPct: 1.2, tolerance: 60 })).toBeNull();
  });

  it('same blue color: SOLID line resolves to 1-Hour Partition', () => {
    expect(detectAssemblyType([solid(50, BLUE)], 50, 55, styleCal, { radiusPct: 1.2, tolerance: 60 })).toBe('1hr_partition');
  });

  it('same blue color: DASHED line resolves to Smoke Barrier', () => {
    expect(detectAssemblyType([dashed(50, BLUE)], 50, 55, styleCal, { radiusPct: 1.2, tolerance: 60 })).toBe('smoke_barrier');
  });

  it('balloon footprint catches a wall above the tip (door-opening case)', () => {
    const smokeCal: ProjectCalibration = { calibrated: true, types: { smoke_barrier: { rgb: BLUE, width: 30 } } };
    const strokes = [hline(55, BLUE)]; // wall 1% above the tip
    // Tip alone (in the door opening), tight radius: misses the wall.
    expect(detectAssemblyType(strokes, 50, 56, smokeCal, { radiusPct: 0.4, tolerance: 60 })).toBeNull();
    // Balloon reaches up to its head and catches the wall it covers.
    expect(detectAssemblyType(strokes, 50, 56, smokeCal, { radiusPct: 0.4, tolerance: 60, headOffsetPct: 1.2 })).toBe('smoke_barrier');
  });
});

describe('detectAssemblyTypeWithConfidence', () => {
  it('high confidence on a clean, close single-color match', () => {
    const r = detectAssemblyTypeWithConfidence([line(50, [250, 5, 5])], 50, 55, cal, { radiusPct: 1.2, tolerance: 60 });
    expect(r.type).toBe('1hr_fire');
    expect(r.lowConfidence).toBe(false);
  });

  it('low confidence when the matched color is near the tolerance edge', () => {
    // distance from RED [255,0,0] is 45 (> 0.6*60 = 36) but still within tolerance 60.
    const r = detectAssemblyTypeWithConfidence([line(50, [210, 0, 0])], 50, 55, cal, { radiusPct: 1.2, tolerance: 60 });
    expect(r.type).toBe('1hr_fire');
    expect(r.lowConfidence).toBe(true);
  });

  it('low confidence when precedence had to break a tie (two types touched)', () => {
    const strokes = [line(50, RED), line(51, GREEN)];
    const r = detectAssemblyTypeWithConfidence(strokes, 50.5, 55, cal, { radiusPct: 1.2, tolerance: 60 });
    expect(r.type).toBe('1hr_fire');
    expect(r.lowConfidence).toBe(true);
  });

  it('no low-confidence flag when nothing matches', () => {
    const r = detectAssemblyTypeWithConfidence([line(50, RED)], 10, 10, cal, { radiusPct: 1.2, tolerance: 60 });
    expect(r.type).toBeNull();
    expect(r.lowConfidence).toBe(false);
  });
});
