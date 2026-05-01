# Zoom-to-Cursor Debugging Summary

## Objective
Implement smooth zoom-to-cursor behavior that matches Fieldwire's functionality: when the user scrolls to zoom, the point under the cursor should remain under the cursor as the zoom level changes, and this behavior should persist continuously as the user continues to scroll.

---

## Attempt 1: Custom Canvas Context Transform Math (Checkpoints: 60356fba → ec1c473d)
**Approach:** Use canvas context `translate()` and `scale()` methods to handle all zoom/pan transformations.

**Implementation:**
- Calculated zoom focal point using cursor position relative to canvas
- Applied transforms in order: `context.scale(scale, scale)` then `context.translate(-panX, -panY)`
- Attempted to keep cursor point locked by calculating: `pdfPoint = (cursorX - panX) / scale`

**Result:** ❌ **FAILED** - Zoom focal point wandered away from cursor. The math was theoretically correct but visual behavior was wrong.

**Why it failed:** Canvas context transforms are applied to the rendering pipeline, not to the coordinate system. The zoom-to-cursor calculation didn't account for the actual visual transformation order.

---

## Attempt 2: CSS Transform Scale with Canvas Rendering (Checkpoint: 60356fba)
**Approach:** Render canvas at 1x, then use CSS `transform: scale()` to zoom.

**Implementation:**
- Canvas renders at full resolution
- CSS applies `transform: scale(scale) translate(panX, panY)`
- Attempted to calculate zoom focal point using cursor position

**Result:** ❌ **FAILED** - Zoom still wandered from cursor. Visual glitches at extreme zoom levels.

**Why it failed:** Mixing canvas rendering coordinates with CSS transform coordinates created a coordinate system mismatch. The browser's CSS transform happens after canvas rendering, making the math inconsistent.

---

## Attempt 3: Panzoom Library Integration (Checkpoints: cd8cad1c → e2a6ba8c)
**Approach:** Use the battle-tested `@panzoom/panzoom` library (used by Google Docs and Figma).

**Implementation:**
- Integrated Panzoom library with default settings
- Set min zoom 0.5x, max zoom 3x
- Used `panzoomRef.current.reset()` for reset button

**Result:** ❌ **FAILED** - Reset button threw error: `panzoomRef.current.reset is not a function`. Zoom-to-cursor behavior still incorrect.

**Why it failed:** 
1. Library API mismatch - `reset()` doesn't exist, should use `zoomTo()`
2. More importantly: Panzoom library's zoom-to-cursor implementation didn't match Fieldwire's behavior. The focal point still drifted.

---

## Attempt 4: Custom Zoom with Canvas Rect Lookup (Checkpoint: c554a3e6)
**Approach:** Calculate zoom focal point using `canvasRef.current.getBoundingClientRect()` to find canvas position on screen.

**Implementation:**
```typescript
const rect = canvasRef.current.getBoundingClientRect();
const containerRect = containerRef.current.getBoundingClientRect();

// Cursor position relative to container
const cursorX = e.clientX - containerRect.left;
const cursorY = e.clientY - containerRect.top;

// Canvas position on screen
const canvasScreenX = rect.left - containerRect.left;
const canvasScreenY = rect.top - containerRect.top;

// Cursor position relative to canvas
const cursorCanvasX = cursorX - canvasScreenX;
const cursorCanvasY = cursorY - canvasScreenY;

// Current point on PDF before zoom
const pdfPointX = (cursorCanvasX - panXRef.current) / scaleRef.current;
const pdfPointY = (cursorCanvasY - panYRef.current) / scaleRef.current;

// Calculate new pan
const newPanX = cursorCanvasX - pdfPointX * newScale;
const newPanY = cursorCanvasY - pdfPointY * newScale;
```

**Result:** ❌ **FAILED** - Zoom focal point still wandered away from cursor.

**Why it failed:** **CRITICAL ARCHITECTURAL BUG** - `getBoundingClientRect()` returns the canvas position **after** CSS transforms have been applied, but `panXRef.current` and `panYRef.current` are pre-transform values. These two sources of truth drift apart with each zoom, causing the focal point to wander.

---

## Attempt 5: Claude's Container-Based Math Fix (Checkpoint: 6c829861)
**Approach:** Remove canvas rect lookup entirely. Use only container-based math since canvas origin in container space is simply `(panX, panY)`.

**Implementation:**
```typescript
const containerRect = containerRef.current.getBoundingClientRect();

// Cursor position relative to container
const cursorX = e.clientX - containerRect.left;
const cursorY = e.clientY - containerRect.top;

// The point on the PDF canvas (in canvas pixels) currently under the cursor
// panX/panY are the canvas origin offsets from the container origin
const pdfPointX = (cursorX - panXRef.current) / scaleRef.current;
const pdfPointY = (cursorY - panYRef.current) / scaleRef.current;

// New scale
const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
const newScale = Math.max(0.5, Math.min(5, scaleRef.current * zoomFactor));

// After scaling, reposition so the same PDF point stays under the cursor
const newPanX = cursorX - pdfPointX * newScale;
const newPanY = cursorY - pdfPointY * newScale;
```

**Additional fixes:**
- Added RAF throttling to prevent rapid scroll events from queuing stale calculations
- Added non-passive wheel event listener to ensure `preventDefault()` works

**Result:** ❌ **FAILED** - Zoom focal point still wandered away from cursor.

**Why it failed:** Unknown. The math is theoretically sound. Possible issues:
1. Canvas rendering at 2x resolution (`scale: 2` in PDF.js viewport) - coordinate mismatch?
2. CSS transform order or timing issue
3. Event listener not actually preventing default scroll behavior
4. RAF throttling masking the real problem

---

## Root Cause Analysis

### The Core Problem
The zoom focal point calculation assumes a direct 1:1 mapping between screen coordinates and canvas coordinates. However, several factors may break this assumption:

1. **PDF.js Rendering Scale:** The PDF is rendered at 2x resolution (`viewport.scale = 2`), but the zoom calculations don't account for this scaling factor.

2. **CSS Transform vs Canvas Coordinates:** The canvas is transformed via CSS (`transform: translate(panX, panY) scale(scale)`), but the zoom calculation uses raw canvas pixels. These coordinate systems may not align.

3. **Event Timing:** Wheel events fire before the DOM has updated, so `getBoundingClientRect()` might return stale values.

4. **RAF Timing:** The RAF throttling might be delaying updates, causing the visual zoom to appear at a different focal point than calculated.

### What We Know Works
- Pan with mouse drag works correctly
- Reset button works (animates back to 1x zoom)
- Pin placement and rendering works
- Page navigation works

### What Doesn't Work
- Zoom focal point drifts away from cursor
- This happens regardless of implementation approach (canvas math, CSS transforms, libraries, container-based math)

---

## Potential Solutions to Research

### 1. Account for PDF.js Rendering Scale
The PDF is rendered at 2x resolution. The zoom calculation might need to account for this:
```typescript
// If PDF renders at 2x, canvas pixels are 2x actual PDF pixels
const pdfPointX = (cursorX - panXRef.current) / (scaleRef.current * 2);
const pdfPointY = (cursorY - panYRef.current) / (scaleRef.current * 2);
```

### 2. Use Canvas-Based Coordinates Only
Instead of mixing screen coordinates with canvas coordinates, convert everything to canvas pixel space:
```typescript
// Convert cursor position to canvas pixel coordinates
const canvasX = (cursorX - panXRef.current) / scaleRef.current;
const canvasY = (cursorY - panYRef.current) / scaleRef.current;

// After zoom, calculate new pan in canvas space
const newPanX = cursorX - canvasX * newScale;
const newPanY = cursorY - canvasY * newScale;
```

### 3. Use Transform-Origin Instead of Pan
Instead of using `translate()` for pan, use `transform-origin` to set the zoom focal point:
```typescript
canvas.style.transformOrigin = `${cursorX}px ${cursorY}px`;
canvas.style.transform = `scale(${scale})`;
// Then adjust position to keep canvas visible
```

### 4. Render PDF at 1x Resolution
Change PDF.js viewport scale from 2 to 1, which might simplify coordinate mapping:
```typescript
const viewport = page.getViewport({ scale: 1 }); // Instead of scale: 2
```

### 5. Debug with Visual Feedback
Add debug overlays showing:
- Cursor position (green dot)
- Calculated focal point (red dot)
- Canvas bounding box (blue outline)
This will reveal exactly where the math is going wrong.

### 6. Study Fieldwire's Actual Implementation
Fieldwire uses a similar tech stack. Their zoom-to-cursor might use:
- A different coordinate system (e.g., always in canvas space)
- Delayed pan updates (pan adjusts after zoom completes)
- A different zoom factor (not 1.1x/0.9x per scroll)
- Transform-origin instead of translate

---

## Checkpoint History
| Version | Approach | Result |
|---------|----------|--------|
| 60356fba | Canvas context transforms | ❌ Focal point wandered |
| cd8cad1c | Panzoom library | ❌ Reset failed, behavior wrong |
| c554a3e6 | Canvas rect lookup | ❌ Drift between pre/post-transform values |
| 6c829861 | Container-based math (Claude's fix) | ❌ Still wandered |

---

## Next Steps for Morning
1. **Implement debug overlays** to visualize exactly where the focal point is calculating vs where it should be
2. **Test with PDF at 1x resolution** to rule out rendering scale issues
3. **Try transform-origin approach** as an alternative to translate-based pan
4. **Research Fieldwire's actual implementation** if possible
5. **Consider simpler zoom behavior** - maybe Fieldwire doesn't actually zoom-to-cursor, but instead zooms to center and pans separately?

---

## Code Files Involved
- `/home/ubuntu/codify-door-inspection/client/src/components/PDFViewer.tsx` - Main PDF viewer component
- `/home/ubuntu/codify-door-inspection/public/pdf.worker.min.js` - PDF.js worker
- Canvas rendering happens at line ~120-160
- Zoom math happens at line ~265-301
- Pan happens at line ~303-325

---

## Summary
Despite 5 different approaches and extensive debugging, the zoom-to-cursor focal point continues to drift away from the cursor. The issue appears to be architectural rather than a simple math error, likely stemming from a mismatch between coordinate systems (screen vs canvas vs PDF.js rendering scale). The next debugging session should focus on visualizing the actual vs calculated focal points and testing simpler approaches like transform-origin.
