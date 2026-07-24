import { describe, it, expect } from 'vitest';
import { pinToUserSpace } from './ceilingLocationSummary';

// pinToUserSpace maps a pin's (xPct,yPct) — percent from the DISPLAYED page's
// top-left — to a point in the page's unrotated user space (origin bottom-left).
// A landscape plan page: mediabox W=1000, H=800.
const W = 1000, H = 800;
const near = (a: number, b: number) => Math.abs(a - b) < 0.001;

describe('pinToUserSpace (rotation 0)', () => {
  it('maps display corners to user-space corners', () => {
    expect(pinToUserSpace(W, H, 0, 0, 0)).toEqual({ x: 0, y: 800 });     // top-left
    expect(pinToUserSpace(W, H, 0, 100, 0)).toEqual({ x: 1000, y: 800 }); // top-right
    expect(pinToUserSpace(W, H, 0, 0, 100)).toEqual({ x: 0, y: 0 });      // bottom-left
    expect(pinToUserSpace(W, H, 0, 100, 100)).toEqual({ x: 1000, y: 0 }); // bottom-right
    expect(pinToUserSpace(W, H, 0, 50, 50)).toEqual({ x: 500, y: 400 });  // center
  });
});

describe('pinToUserSpace (rotation 180)', () => {
  it('flips both axes', () => {
    expect(pinToUserSpace(W, H, 180, 0, 0)).toEqual({ x: 1000, y: 0 });   // display TL -> user BR
    expect(pinToUserSpace(W, H, 180, 100, 100)).toEqual({ x: 0, y: 800 });// display BR -> user TL
    expect(pinToUserSpace(W, H, 180, 50, 50)).toEqual({ x: 500, y: 400 });
  });
});

describe('pinToUserSpace (rotation 90 CW)', () => {
  it('maps the displayed page (H wide, W tall) into user space', () => {
    // Display TL -> user BL for a 90° CW rotation.
    const tl = pinToUserSpace(W, H, 90, 0, 0);
    expect(near(tl.x, 0) && near(tl.y, 0)).toBe(true);
    // Display top-right (x=100%) -> user top-left.
    const tr = pinToUserSpace(W, H, 90, 100, 0);
    expect(near(tr.x, 0) && near(tr.y, 800)).toBe(true);
    // Center stays center.
    const c = pinToUserSpace(W, H, 90, 50, 50);
    expect(near(c.x, 500) && near(c.y, 400)).toBe(true);
  });
});

describe('pinToUserSpace (rotation 270)', () => {
  it('center stays center and axes are consistent', () => {
    const c = pinToUserSpace(W, H, 270, 50, 50);
    expect(near(c.x, 500) && near(c.y, 400)).toBe(true);
    // Display TL -> user TR for 270° (90° CCW).
    const tl = pinToUserSpace(W, H, 270, 0, 0);
    expect(near(tl.x, 1000) && near(tl.y, 800)).toBe(true);
  });
});
