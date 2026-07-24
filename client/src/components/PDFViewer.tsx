import { useRef, useState, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DoorPin } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import {
  extractWallStrokes, nearestWallColorAt, detectAssemblyTypeWithConfidence, styleAt, explainDetection,
  WallStroke, ProjectCalibration, WallPick, DEFAULT_TOLERANCE,
} from '@/lib/wallDetect';

// Balloon geometry from drawBalloonPin (canvas px in the scale:2 viewport): the
// teardrop's circle has radius 20 with its center 32px above the tip. Detection
// tests this whole footprint so a pin dropped in a door opening still reads the
// wall its balloon covers.
const BALLOON_RADIUS_PX = 20;
const BALLOON_CENTER_OFFSET_PX = 32;

// Tap radius (percent of page) when picking a wall color during calibration —
// a bit larger than the drop-detection radius since the user aims by hand.
const CALIBRATE_RADIUS_PCT = 2.5;

if (typeof pdfjsLib.GlobalWorkerOptions !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
}

interface PdfEntry {
  id: string;
  file: File;
  pageOffset: number;
  pageCount: number;
}

interface PDFViewerProps {
  pdfEntries: PdfEntry[];
  pdfDocuments: Map<string, pdfjsLib.PDFDocumentProxy>;
  totalPages: number;
  pins: DoorPin[];
  onPinAdded: (pin: DoorPin) => void;
  onPinRemoved: (pinId: string) => void;
  onPinUpdated?: (pin: DoorPin) => void; // move a pin: re-upsert with new x/y
  onPinStatusChanged: (pinId: string, status: DoorPin['status']) => void;
  onPageChange: (newPage: number) => void;
  onPinSelected: (pin: DoorPin) => void;
  isDropMode: boolean;
  isSelectMode?: boolean;
  selectedPinIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  onTotalPagesChange?: (total: number) => void;
  onFloorNameExtracted?: (pageNum: number, name: string) => void;
  initialPage?: number;
  // Wall-color calibration + assembly-type auto-detect (Milestone 2)
  isCalibrateMode?: boolean;
  calibration?: ProjectCalibration;
  onWallColorPicked?: (pick: WallPick | null) => void;
}

export default function PDFViewer({
  pdfEntries,
  pdfDocuments,
  totalPages: totalPagesFromProps,
  pins,
  onPinAdded,
  onPinRemoved,
  onPinUpdated,
  onPinStatusChanged,
  onPageChange,
  onPinSelected,
  isDropMode,
  isSelectMode = false,
  selectedPinIds = new Set(),
  onSelectionChange,
  onTotalPagesChange,
  onFloorNameExtracted,
  initialPage = 1,
  isCalibrateMode = false,
  calibration,
  onWallColorPicked,
}: PDFViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Saturated wall strokes for the current page (percent coords), used by
  // calibration color-picking and on-drop assembly-type detection. Extracted
  // after each page render; empty for non-vector pages (→ manual fallback).
  const wallStrokesRef = useRef<WallStroke[]>([]);
  // Latest page the viewer is showing — lets a slow stroke-extract discard its
  // result if the user has since flipped to another page.
  const latestPageRef = useRef<number>(initialPage);

  // Pin move / delete. Current-value refs so the native touch listeners (which
  // only re-subscribe on mode change) always see fresh pins/callbacks.
  const pinsRef = useRef<DoorPin[]>(pins);
  pinsRef.current = pins;
  const activePageForPinsRef = useRef<number>(initialPage);
  const cbRef = useRef({ onPinUpdated, onPinRemoved });
  cbRef.current = { onPinUpdated, onPinRemoved };
  const dragPinRef = useRef<{ id: string; moved: boolean } | null>(null); // mouse/touch drag in progress
  const dragPosRef = useRef<{ id: string; x: number; y: number } | null>(null); // live dragged position (percent)
  const touchLongPressRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false); // don't select a pin on the click that ends a drag
  // Right-click / long-press pin menu (at the cursor).
  const [pinMenu, setPinMenu] = useState<{ x: number; y: number; id: string; iconNo: string } | null>(null);
  // Transparent layer above the PDF for pins + grid, so pin changes never
  // re-render the PDF (previously caused the flash and dropped/renumbered pins).
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<any>(null);
  const [activePage, setActivePage] = useState(initialPage);
  activePageForPinsRef.current = activePage; // keep the pin hit-test's page current
  const [totalPages, setTotalPages] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const renderTaskRef = useRef<any>(null);
  const isMountedRef = useRef(true);
  const baseViewportRef = useRef<any>(null);
  const isRenderingRef = useRef(false);

  // Zoom and pan state
  const scaleRef = useRef(1);
  const panXRef = useRef(0);
  const panYRef = useRef(0);
  const [scale, setScale] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const animationFrameRef = useRef<number | null>(null);
  const wheelPendingRef = useRef(false);

  // Touch pinch-to-zoom
  const touchDistanceRef = useRef<number | null>(null);
  const touchStartScaleRef = useRef<number>(1);
  const lastTouchRef = useRef<{ x: number; y: number } | null>(null);
  const touchMovedRef = useRef(false);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);

  // Floor name extraction
  const [floorNames, setFloorNames] = useState<Record<number, string>>({});

  // Marquee selection
  const [marqueeStart, setMarqueeStart] = useState<{ x: number; y: number } | null>(null);
  const [marqueeEnd, setMarqueeEnd] = useState<{ x: number; y: number } | null>(null);
  const [hoveredPinId, setHoveredPinId] = useState<string | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  const getTouchDistance = (touches: TouchList): number => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Fix passive wheel listener and add touch handlers
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isDropMode) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('exitDropMode'));
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        touchDistanceRef.current = getTouchDistance(e.touches);
        touchStartScaleRef.current = scaleRef.current;
      } else if (e.touches.length === 1 && !isDropMode && !isSelectMode && !isCalibrateMode) {
        // Record start position but DON'T preventDefault yet
        touchStartPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        touchMovedRef.current = false;
        // Pin under the finger? Prepare to drag it, and arm long-press-to-delete.
        const tx = e.touches[0].clientX, ty = e.touches[0].clientY;
        const c = toCanvasPoint(tx, ty);
        const hit = hitTestPin(c.canvasX, c.canvasY);
        if (hit) {
          dragPinRef.current = { id: hit.id, moved: false };
          dragPosRef.current = { id: hit.id, x: hit.x, y: hit.y };
          if (touchLongPressRef.current) clearTimeout(touchLongPressRef.current);
          touchLongPressRef.current = window.setTimeout(() => {
            touchLongPressRef.current = null;
            if (dragPinRef.current && !dragPinRef.current.moved) {
              const p = pinsRef.current.find((pp) => pp.id === hit.id);
              dragPinRef.current = null;
              dragPosRef.current = null;
              suppressClickRef.current = true;
              if (p) setPinMenu({ x: tx, y: ty, id: p.id, iconNo: p.iconNo });
              drawOverlay();
            }
          }, 550);
        }
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && touchDistanceRef.current !== null) {
        e.preventDefault();
        const currentDistance = getTouchDistance(e.touches);
        const scaleFactor = currentDistance / touchDistanceRef.current;
        // Cap at 3x (was 5x): compositing the 2x-rendered canvas scaled much
        // further crashes iOS Safari ("A problem repeatedly occurred").
        const newScale = Math.max(0.25, Math.min(3, touchStartScaleRef.current * scaleFactor));

        // Zoom to center of pinch
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const centerX = (touch1.clientX + touch2.clientX) / 2;
        const centerY = (touch1.clientY + touch2.clientY) / 2;

        const containerRect = container.getBoundingClientRect();
        const cursorX = centerX - containerRect.left;
        const cursorY = centerY - containerRect.top;

        // Add null check — skip pan calculation if viewport not ready
        let newPanX = panXRef.current;
        let newPanY = panYRef.current;
        
        if (baseViewportRef.current) {
          const pdfPointX = (cursorX - panXRef.current) / (scaleRef.current / 2);
          const pdfPointY = (cursorY - panYRef.current) / (scaleRef.current / 2);
          newPanX = cursorX - pdfPointX * (newScale / 2);
          newPanY = cursorY - pdfPointY * (newScale / 2);
        }

        scaleRef.current = newScale;
        panXRef.current = newPanX;
        panYRef.current = newPanY;
        
        // Update React state for re-render
        setScale(newScale);
        setPanX(newPanX);
        setPanY(newPanY);
      } else if (e.touches.length === 1 && lastTouchRef.current) {
        const dx = e.touches[0].clientX - (touchStartPosRef.current?.x || 0);
        const dy = e.touches[0].clientY - (touchStartPosRef.current?.y || 0);
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Dragging a grabbed pin (finger landed on a pin at touchstart).
        if (dragPinRef.current) {
          if (dist > 8) {
            dragPinRef.current.moved = true;
            if (touchLongPressRef.current) { clearTimeout(touchLongPressRef.current); touchLongPressRef.current = null; }
            e.preventDefault();
            const vp = baseViewportRef.current;
            if (vp) {
              const c = toCanvasPoint(e.touches[0].clientX, e.touches[0].clientY);
              dragPosRef.current = {
                id: dragPinRef.current.id,
                x: clampPct((c.canvasX / vp.width) * 100),
                y: clampPct((c.canvasY / vp.height) * 100),
              };
              drawOverlay();
            }
          }
          lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
          return;
        }

        // Only start panning if moved more than 8px (distinguishes tap from drag)
        if (dist > 8) {
          touchMovedRef.current = true;
          e.preventDefault(); // only prevent default when actually dragging
          const deltaX = e.touches[0].clientX - lastTouchRef.current.x;
          const deltaY = e.touches[0].clientY - lastTouchRef.current.y;
          panXRef.current += deltaX;
          panYRef.current += deltaY;
          setPanX(panXRef.current);
          setPanY(panYRef.current);
        }

        lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    };

    const handleTouchEnd = () => {
      if (touchLongPressRef.current) { clearTimeout(touchLongPressRef.current); touchLongPressRef.current = null; }
      if (dragPinRef.current) {
        const moved = dragPinRef.current.moved;
        const pos = dragPosRef.current;
        dragPinRef.current = null;
        dragPosRef.current = null;
        if (moved && pos && cbRef.current.onPinUpdated) {
          const p = pinsRef.current.find((pp) => pp.id === pos.id);
          if (p) cbRef.current.onPinUpdated({ ...p, x: pos.x, y: pos.y });
          suppressClickRef.current = true; // don't also open the wizard
        }
        drawOverlay();
      }
      touchDistanceRef.current = null;
      lastTouchRef.current = null;
      touchStartPosRef.current = null;
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDropMode, isSelectMode, isCalibrateMode]);



  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (pdfEntries.length === 0 || pdfDocuments.size === 0) {
      setPdf(null);
      setTotalPages(0);
      return;
    }

    // Find which entry contains the current activePage
    const entry = pdfEntries.find(
      (e) => activePage >= e.pageOffset + 1 &&
              activePage <= e.pageOffset + e.pageCount
    ) || pdfEntries[0];

    const resolvedPdf = pdfDocuments.get(entry.id);
    if (resolvedPdf && isMountedRef.current) {
      setPdf(resolvedPdf);
      setTotalPages(totalPagesFromProps);
      onTotalPagesChange?.(totalPagesFromProps);
      setError(null);
    }
  }, [pdfEntries, pdfDocuments, totalPagesFromProps, activePage]);

  useEffect(() => {
    if (!pdf || !canvasRef.current || activePage > totalPages) return;

    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel();
      } catch (e) {
        // Ignore
      }
      renderTaskRef.current = null;
    }

    // Stale strokes from the previous page must not be used for detection on
    // the new page until re-extracted below.
    wallStrokesRef.current = [];
    latestPageRef.current = activePage;

    const renderPage = async () => {
      isRenderingRef.current = true;
      try {
        // Resolve correct PDF and local page number for multi-PDF support
        const entry = pdfEntries.find(
          (e) => activePage >= e.pageOffset + 1 &&
                  activePage <= e.pageOffset + e.pageCount
        ) || pdfEntries[0];
        const localPage = activePage - (entry?.pageOffset || 0);

        const page = await pdf.getPage(localPage);
        const viewport = page.getViewport({ scale: 2 });
        baseViewportRef.current = viewport;

        const canvas = canvasRef.current!;
        const context = canvas.getContext('2d');

        if (!context) {
          console.error('Failed to get canvas context');
          return;
        }

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const renderTask = page.render({
          canvasContext: context,
          viewport: viewport,
        });

        renderTaskRef.current = renderTask;
        await renderTask.promise;

        if (!isMountedRef.current) return;

        // Fit entire PDF to window
        if (containerRef.current) {
          const containerWidth = containerRef.current.clientWidth;
          const containerHeight = containerRef.current.clientHeight;
          const displayW = canvas.width / 2;
          const displayH = canvas.height / 2;

          // Fit to window
          const padding = 32;
          const scaleToFitW = (containerWidth - padding) / displayW;
          const scaleToFitH = (containerHeight - padding) / displayH;
          const fitScale = Math.min(scaleToFitW, scaleToFitH, 1);

          const scaledW = displayW * fitScale;
          const scaledH = displayH * fitScale;
          const initialPanX = (containerWidth - scaledW) / 2;
          const initialPanY = (containerHeight - scaledH) / 2;

          panXRef.current = initialPanX;
          panYRef.current = initialPanY;
          setPanX(initialPanX);
          setPanY(initialPanY);
          scaleRef.current = fitScale;
          setScale(fitScale);
        }

        // Paint pins + grid on the separate overlay layer (not on the PDF canvas).
        drawOverlay();

        // Extract the saturated wall strokes for this page (for calibration
        // color-picking + assembly-type auto-detect). Non-blocking; detection
        // only reads the ref on a later user click. Guard against races where
        // the user flips pages mid-extract.
        const pageForStrokes = activePage;
        extractWallStrokes(page)
          .then((strokes) => {
            if (isMountedRef.current && latestPageRef.current === pageForStrokes) {
              wallStrokesRef.current = strokes;
            }
          })
          .catch(() => { /* non-vector or error → manual fallback */ });

        // Extract floor name from page text
        try {
          const textContent = await page.getTextContent();
          // Keep items SEPARATE — do not join into one string
          const items: string[] = textContent.items
            .map((item: any) => item.str.trim())
            .filter(Boolean);

          let floorName = `Page ${activePage}`;

          // Check for Title Sheet FIRST
          if (items.some((s) => s.toUpperCase() === 'TITLE SHEET')) {
            floorName = 'Title Sheet';
          } else {
            // Find LIFE SAFETY PLAN items with looser regex, excluding SMOKE COMPARTMENTS
            const lspItems = items.filter((s) =>
              /^.+\s*(?:-\s*)?LIFE\s*SAFETY\s*PLAN$/i.test(s) &&
              !/^SMOKE COMPARTMENTS/i.test(s)
            );
            if (lspItems.length > 0) {
              const m = lspItems[0].match(/^(.+?)\s*(?:-\s*)?LIFE\s*SAFETY\s*PLAN$/i);
              if (m && m[1].trim()) {
                floorName = m[1].trim()
                  .split(' ')
                  .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                  .join(' ');
              }
            }
            // Fallback: Try "X LIFESAFETY PLAN" (no space)
            if (floorName === `Page ${activePage}`) {
              const lspNoSpace = items.find((s) =>
                /^.+LIFESAFETY\s*PLAN$/i.test(s)
              );
              if (lspNoSpace) {
                const m = lspNoSpace.match(/^(.*?)(?:\s*-\s*)?LIFESAFETY\s*PLAN$/i);
                if (m?.[1]?.trim()) {
                  floorName = m[1].trim()
                    .split(' ')
                    .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                    .join(' ');
                }
              }
            }
          }

          // Strip trailing "Floor" from floor name
          floorName = floorName
            .replace(/\s+Floor\s*$/i, '')
            .trim();

          setFloorNames((prev) => ({ ...prev, [activePage]: floorName }));
          onFloorNameExtracted?.(activePage, floorName);
        } catch (err) {
          console.warn('Failed to extract floor name:', err);
        }

        renderTaskRef.current = null;
      } catch (err) {
        if (!isMountedRef.current) return;
        if (err instanceof Error && err.message.includes('cancelled')) {
          return;
        }
        // Log but DON'T set error state on mobile — just retry
        console.warn('Render error (mobile):', err);
        // Don't call setError() here — that triggers the white screen
      } finally {
        isRenderingRef.current = false;
      }
    };

    renderPage();
  }, [pdf, activePage, totalPages]);

  // Repaint ONLY the pin/grid overlay when pins, selection, or the floor name
  // change — the PDF underneath is untouched (no flash, no dropped pins).
  useEffect(() => {
    drawOverlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins, selectedPinIds, floorNames, activePage, hoveredPinId]);

  const drawGrid = (
    context: CanvasRenderingContext2D,
    viewport: any,
    floorName: string
  ) => {
    // Only skip the grid on a real title sheet — not just "page 1", since some
    // plans have a floor (e.g. Basement) as the first page with no title sheet.
    if (floorName === 'Title Sheet') return;

    const w = viewport.width;
    const h = viewport.height;
    const cols = 8;
    const rows = 8;
    const cellW = w / cols;
    const cellH = h / rows;

    context.save();

    context.strokeStyle = 'rgba(0, 0, 0, 0.7)';
    context.lineWidth = 9;

    for (let c = 1; c < cols; c++) {
      context.beginPath();
      context.moveTo(c * cellW, 0);
      context.lineTo(c * cellW, h);
      context.stroke();
    }

    for (let r = 1; r < rows; r++) {
      context.beginPath();
      context.moveTo(0, r * cellH);
      context.lineTo(w, r * cellH);
      context.stroke();
    }

    const colLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const rowLabels = ['1', '2', '3', '4', '5', '6', '7', '8'];

    context.fillStyle = 'rgba(0, 0, 0, 0.7)';
    context.font = `bold ${Math.floor(cellW * 0.09)}px Arial`;
    context.textAlign = 'center';
    context.textBaseline = 'top';

    for (let c = 0; c < cols; c++) {
      context.fillText(colLabels[c], c * cellW + cellW / 2, cellH * 0.15);
    }

    context.textAlign = 'left';
    context.textBaseline = 'middle';

    for (let r = 0; r < rows; r++) {
      context.fillText(rowLabels[r], cellW * 0.25, r * cellH + cellH / 2);
    }

    context.restore();
  };

  const drawBalloonPin = (
    context: CanvasRenderingContext2D,
    pin: DoorPin,
    viewport: any,
    isSelected: boolean = false,
    isHovered: boolean = false
  ) => {
    const x = (pin.x / 100) * viewport.width;
    const y = (pin.y / 100) * viewport.height;

    const colors: Record<string, { bg: string; border: string; text: string }> = {
      pass: { bg: '#28c76f', border: '#1a9e52', text: '#ffffff' },
      fail: { bg: '#ea5455', border: '#c0392b', text: '#ffffff' },
      inaccessible: { bg: '#ff9f43', border: '#cc7a00', text: '#ffffff' },
      not_inspected: { bg: '#f5c518', border: '#c9a200', text: '#0d0f12' },
    };

    const color = colors[pin.status] || colors.not_inspected;
    const r = 20; // increased radius for easier tapping
    // Center of balloon circle sits above the tip
    const cx = x;
    const cy = y - r * 1.6; // reduced height

    context.save();

    // Hover highlight ring (behind the balloon) — visual feedback on desktop.
    if (isHovered && !isSelected) {
      context.fillStyle = 'rgba(59, 130, 246, 0.18)';
      context.beginPath();
      context.arc(cx, cy, r + 10, 0, Math.PI * 2);
      context.fill();
    }

    // Draw selection highlight ring FIRST (behind the balloon)
    if (isSelected) {
      context.fillStyle = 'rgba(59, 130, 246, 0.3)';
      context.beginPath();
      context.arc(cx, cy, r + 8, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = '#3b82f6';
      context.lineWidth = 3;
      context.stroke();
    }

    // Draw compact teardrop path
    context.beginPath();
    // Start at the tip (bottom point)
    context.moveTo(x, y);
    // Left side curve up to circle
    context.bezierCurveTo(
      x - r * 0.5, y - r * 0.6,   // control 1
      cx - r,      cy + r * 0.6,  // control 2
      cx - r,      cy             // end: left of circle
    );
    // Top arc of circle
    context.arc(cx, cy, r, Math.PI, 0, false);
    // Right side curve down to tip
    context.bezierCurveTo(
      cx + r,      cy + r * 0.6,  // control 1
      x + r * 0.5, y - r * 0.6,  // control 2
      x,           y              // end: tip
    );
    context.closePath();

    // Flat solid fill
    context.fillStyle = color.bg;
    context.fill();
    context.strokeStyle = color.border;
    context.lineWidth = 2;
    context.stroke();

    // Icon number
    context.fillStyle = color.text;
    context.font = `bold 28px "Barlow Condensed", "Arial Narrow", Arial, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(pin.iconNo || '?', cx, cy);

    context.restore();
  };

  // Repaint the overlay layer (pins + grid) to match the PDF underneath. Cheap:
  // just a canvas clear + shape draws, no PDF re-render.
  const drawOverlay = () => {
    const overlay = overlayRef.current;
    const viewport = baseViewportRef.current;
    if (!overlay || !viewport) return;
    const ctx = overlay.getContext('2d');
    if (!ctx) return;
    if (overlay.width !== viewport.width) overlay.width = viewport.width;
    if (overlay.height !== viewport.height) overlay.height = viewport.height;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    pinsRef.current
      .filter((p) => !p.pageNumber || p.pageNumber === activePage)
      .forEach((pin) => {
        const dp = dragPosRef.current;
        const draw = dp && dp.id === pin.id ? { ...pin, x: dp.x, y: dp.y } : pin;
        drawBalloonPin(ctx, draw, viewport, selectedPinIds.has(pin.id), pin.id === hoveredPinId);
      });
    drawGrid(ctx, viewport, floorNames[activePage] || '');
  };

  const handlePageChange = (delta: number) => {
    const newPage = Math.max(1, Math.min(totalPages, activePage + delta));
    setActivePage(newPage);
    onPageChange(newPage);
    // renderPage handles all centering and scale — don't touch it here
  };

  const handleReset = () => {
    if (!canvasRef.current || !containerRef.current) return;

    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;

    // Canvas renders at 2x, so display size at scale=1 is canvas/2
    const displayW = canvasRef.current.width / 2;
    const displayH = canvasRef.current.height / 2;

    // Calculate scale to fit entire PDF in container with padding
    const padding = 32;
    const scaleToFitW = (containerWidth - padding) / displayW;
    const scaleToFitH = (containerHeight - padding) / displayH;
    const fitScale = Math.min(scaleToFitW, scaleToFitH, 1); // never upscale beyond 1x

    // Center at fit scale
    const scaledW = displayW * fitScale;
    const scaledH = displayH * fitScale;
    const centeredPanX = (containerWidth - scaledW) / 2;
    const centeredPanY = (containerHeight - scaledH) / 2;

    animateZoomTo(fitScale, centeredPanX, centeredPanY);
  };

  const animateZoomTo = (targetScale: number, targetPanX: number, targetPanY: number) => {
    const startScale = scaleRef.current;
    const startPanX = panXRef.current;
    const startPanY = panYRef.current;
    const duration = 300; // ms
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function (ease-out)
      const easeProgress = 1 - Math.pow(1 - progress, 3);

      scaleRef.current = startScale + (targetScale - startScale) * easeProgress;
      panXRef.current = startPanX + (targetPanX - startPanX) * easeProgress;
      panYRef.current = startPanY + (targetPanY - startPanY) * easeProgress;

      setScale(scaleRef.current);
      setPanX(panXRef.current);
      setPanY(panYRef.current);

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      }
    };

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    animationFrameRef.current = requestAnimationFrame(animate);
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!canvasRef.current || !containerRef.current) return;

    e.preventDefault();

    const containerRect = containerRef.current.getBoundingClientRect();
    const cursorX = e.clientX - containerRect.left;
    const cursorY = e.clientY - containerRect.top;

    // Point on the PDF (in display pixels) currently under cursor
    const pdfPointX = (cursorX - panXRef.current) / scaleRef.current;
    const pdfPointY = (cursorY - panYRef.current) / scaleRef.current;

    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const newScale = Math.max(0.25, Math.min(3, scaleRef.current * zoomFactor));

    const newPanX = cursorX - pdfPointX * newScale;
    const newPanY = cursorY - pdfPointY * newScale;

    // Update refs first, then state — no RAF delay
    scaleRef.current = newScale;
    panXRef.current = newPanX;
    panYRef.current = newPanY;
    setScale(newScale);
    setPanX(newPanX);
    setPanY(newPanY);
  };

  // Screen point → canvas (scale:2 draw) space.
  const toCanvasPoint = (clientX: number, clientY: number) => {
    const rect = containerRef.current!.getBoundingClientRect();
    return {
      canvasX: (clientX - rect.left - panXRef.current) / (scaleRef.current / 2),
      canvasY: (clientY - rect.top - panYRef.current) / (scaleRef.current / 2),
    };
  };
  // Pin whose balloon is under a canvas point (unified 32px head offset, 28px radius).
  const hitTestPin = (canvasX: number, canvasY: number): DoorPin | undefined => {
    const vp = baseViewportRef.current;
    if (!vp) return undefined;
    const page = activePageForPinsRef.current;
    return pinsRef.current
      .filter((p) => !p.pageNumber || p.pageNumber === page)
      .find((pin) => {
        const px = (pin.x / 100) * vp.width;
        const py = (pin.y / 100) * vp.height - BALLOON_CENTER_OFFSET_PX;
        const dx = canvasX - px, dy = canvasY - py;
        return Math.sqrt(dx * dx + dy * dy) < 28;
      });
  };
  const clampPct = (v: number) => Math.max(0, Math.min(100, v));

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isDropMode || isCalibrateMode) return;

    // View mode: if the press lands on a pin, drag it instead of panning.
    if (!isSelectMode && containerRef.current && baseViewportRef.current) {
      const { canvasX, canvasY } = toCanvasPoint(e.clientX, e.clientY);
      const hit = hitTestPin(canvasX, canvasY);
      if (hit) {
        dragPinRef.current = { id: hit.id, moved: false };
        dragPosRef.current = { id: hit.id, x: hit.x, y: hit.y };
        const vp = baseViewportRef.current;
        const onMove = (mv: MouseEvent) => {
          const c = toCanvasPoint(mv.clientX, mv.clientY);
          dragPosRef.current = {
            id: hit.id,
            x: clampPct((c.canvasX / vp.width) * 100),
            y: clampPct((c.canvasY / vp.height) * 100),
          };
          if (dragPinRef.current) dragPinRef.current.moved = true;
          drawOverlay();
        };
        const onUp = () => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          const moved = dragPinRef.current?.moved;
          const pos = dragPosRef.current;
          dragPinRef.current = null;
          dragPosRef.current = null;
          if (moved && pos && onPinUpdated) {
            const p = pinsRef.current.find((pp) => pp.id === pos.id);
            if (p) onPinUpdated({ ...p, x: pos.x, y: pos.y });
            suppressClickRef.current = true; // don't also open the wizard
          }
          drawOverlay();
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        return; // grabbed a pin — no pan
      }
    }
    if (isDropMode) return;

    if (!containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const startX = e.clientX - containerRect.left;
    const startY = e.clientY - containerRect.top;

    if (isSelectMode) {
      isDraggingRef.current = true;
      dragStartRef.current = { x: startX, y: startY };
      setMarqueeStart({ x: startX, y: startY });
      setMarqueeEnd({ x: startX, y: startY });
    }

    let lastX = e.clientX;
    let lastY = e.clientY;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (isSelectMode && isDraggingRef.current) {
        const currentX = moveEvent.clientX - containerRect.left;
        const currentY = moveEvent.clientY - containerRect.top;
        setMarqueeEnd({ x: currentX, y: currentY });
        return;
      }

      const deltaX = moveEvent.clientX - lastX;
      const deltaY = moveEvent.clientY - lastY;

      panXRef.current += deltaX;
      panYRef.current += deltaY;

      setPanX(panXRef.current);
      setPanY(panYRef.current);

      lastX = moveEvent.clientX;
      lastY = moveEvent.clientY;
    };

    const handleMouseUp = () => {
      if (isSelectMode && isDraggingRef.current) {
        isDraggingRef.current = false;
        dragStartRef.current = null;
      }
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (!canvasRef.current || !containerRef.current || !baseViewportRef.current) return;

    // Ignore if this was a drag (mouse moved significantly)
    if (e.detail === 0) return; // programmatic click, ignore

    const containerRect = containerRef.current.getBoundingClientRect();
    const cursorX = e.clientX - containerRect.left;
    const cursorY = e.clientY - containerRect.top;

    // Convert cursor to canvas pixel space
    const canvasX = (cursorX - panXRef.current) / (scaleRef.current / 2);
    const canvasY = (cursorY - panYRef.current) / (scaleRef.current / 2);

    // Convert to percentage of viewport
    const clickPctX = (canvasX / baseViewportRef.current.width) * 100;
    const clickPctY = (canvasY / baseViewportRef.current.height) * 100;

    // In calibrate mode, a tap reads the color AND line style (solid/dashed) of
    // the nearest wall line and hands them back — no pin is placed.
    if (isCalibrateMode) {
      const hit = nearestWallColorAt(
        wallStrokesRef.current, clickPctX, clickPctY, CALIBRATE_RADIUS_PCT
      );
      if (!hit) { onWallColorPicked?.(null); return; }
      const style = styleAt(wallStrokesRef.current, hit.rgb, clickPctX, clickPctY, DEFAULT_TOLERANCE);
      onWallColorPicked?.({ rgb: hit.rgb, style });
      return;
    }

    // In drop mode, place pin immediately — no hit test
    if (isDropMode) {
      if (clickPctX < 0 || clickPctX > 100 || clickPctY < 0 || clickPctY > 100) return;

      // Calculate grid block from drop position
      const col = Math.min(7, Math.floor(clickPctX / (100/8)));
      const row = Math.min(7, Math.floor(clickPctY / (100/8)));
      const gridBlock = ['A','B','C','D','E','F','G','H'][col] + String(row + 1);

      // Auto-assign next icon number from all pins across all pages
      const nextIconNo = String(pins.length + 1);

      // Auto-detect the assembly type from the calibrated wall line under the
      // balloon (its whole footprint, since the tip often lands in the door
      // opening). null when nothing calibrated is close enough → left blank for
      // the inspector to pick manually (never a wrong guess).
      let detected: string | null = null;
      let detectLowConfidence = false;
      if (calibration) {
        const vw = baseViewportRef.current.width;   // scale:2 viewport
        const vh = baseViewportRef.current.height;
        const headOffsetPct = (BALLOON_CENTER_OFFSET_PX / vh) * 100;
        const radiusPct = (BALLOON_RADIUS_PX / Math.min(vw, vh)) * 100;
        const detectOpts = { radiusPct, tolerance: DEFAULT_TOLERANCE, headOffsetPct };
        const det = detectAssemblyTypeWithConfidence(wallStrokesRef.current, clickPctX, clickPctY, calibration, detectOpts);
        detected = det.type;
        detectLowConfidence = det.lowConfidence;
        // Optional on-device diagnostic: localStorage.detectDebug = '1'
        try {
          if (localStorage.getItem('detectDebug')) {
            const ex = explainDetection(wallStrokesRef.current, clickPctX, clickPctY, calibration, detectOpts);
            console.log('[assembly-detect] chose:', ex.chosen ?? '(blank)', '| touched:',
              ex.touched.map((t) => `rgb(${t.rgb.join(',')})${t.style ? '/' + t.style : ''}→${t.type ?? '—'}`).join('  '));
          }
        } catch { /* ignore */ }
      }

      const newPin: DoorPin = {
        id: uuidv4(),
        x: clickPctX,
        y: clickPctY,
        iconNo: nextIconNo,
        assetId: null,
        status: 'not_inspected',
        projectName: '',
        pageNumber: activePage,
        gridBlock,
        ...(detected ? { assemblyType: detected, assemblyAuto: true, assemblyLowConfidence: detectLowConfidence } : {}),
      };
      onPinAdded(newPin);
      return;
    }

    // In select mode, handle marquee selection
    if (isSelectMode && marqueeStart && marqueeEnd && onSelectionChange) {
      const minDist = Math.sqrt((marqueeEnd.x - marqueeStart.x) ** 2 + (marqueeEnd.y - marqueeStart.y) ** 2);
      
      // Only select if marquee has meaningful size (> 5px)
      if (minDist > 5) {
        // Convert marquee screen coordinates to PDF percentage space
        const startCanvasX = (marqueeStart.x - panXRef.current) / (scaleRef.current / 2);
        const startCanvasY = (marqueeStart.y - panYRef.current) / (scaleRef.current / 2);
        const endCanvasX = (marqueeEnd.x - panXRef.current) / (scaleRef.current / 2);
        const endCanvasY = (marqueeEnd.y - panYRef.current) / (scaleRef.current / 2);
        
        const startPctX = (startCanvasX / baseViewportRef.current.width) * 100;
        const startPctY = (startCanvasY / baseViewportRef.current.height) * 100;
        const endPctX = (endCanvasX / baseViewportRef.current.width) * 100;
        const endPctY = (endCanvasY / baseViewportRef.current.height) * 100;
        
        const minPctX = Math.min(startPctX, endPctX);
        const maxPctX = Math.max(startPctX, endPctX);
        const minPctY = Math.min(startPctY, endPctY);
        const maxPctY = Math.max(startPctY, endPctY);
        
        const selectedIds = new Set<string>();
        pins.forEach((pin) => {
          const isInRange = pin.x >= minPctX && pin.x <= maxPctX && pin.y >= minPctY && pin.y <= maxPctY;
          if (isInRange) {
            selectedIds.add(pin.id);
          }
        });
        onSelectionChange(selectedIds);
      } else {
        // Click with no drag = clear selection
        onSelectionChange(new Set());
      }
      setMarqueeStart(null);
      setMarqueeEnd(null);
      return;
    }

    // Suppress the click that ends a pin drag (don't also open the wizard).
    if (suppressClickRef.current) { suppressClickRef.current = false; return; }

    // In view mode, check if click hit an existing pin
    const hitPin = hitTestPin(canvasX, canvasY);
    if (hitPin) onPinSelected(hitPin);
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-muted">
        <div className="text-center">
          <p className="text-red-500 font-semibold mb-2">Error</p>
          <p className="text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  if (pdfEntries.length === 0 || !pdf) {
    return (
      <div className="flex items-center justify-center h-full bg-muted">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">No PDF loaded</p>
          <p className="text-sm text-muted-foreground">Upload a floor plan to begin</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Toolbar - Empty, navigation moved to bottom */}
      <div className="flex items-center gap-2 p-3 border-b border-border bg-card text-sm">
        {isDropMode && (
          <div className="px-2 py-1 bg-primary/20 text-primary rounded text-xs font-semibold flex-shrink-0">
            DROP
          </div>
        )}
      </div>

      {/* Canvas Container */}
      <div
        ref={containerRef}
        className={`flex-1 overflow-hidden relative ${
          isCalibrateMode ? 'cursor-crosshair' : isDropMode ? 'cursor-crosshair' : isSelectMode ? 'cursor-crosshair' : hoveredPinId ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'
        }`}
        style={{ userSelect: 'none', background: '#f5f5f5' }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onClick={handleCanvasClick}
        onMouseMove={(e) => {
          // Detect pin hover in view + select modes (not while dropping/calibrating).
          if (isDropMode || isCalibrateMode || dragPinRef.current || !containerRef.current || !baseViewportRef.current) return;
          const { canvasX, canvasY } = toCanvasPoint(e.clientX, e.clientY);
          setHoveredPinId(hitTestPin(canvasX, canvasY)?.id || null);
        }}
        onContextMenu={(e) => {
          // Right-click a pin → menu at the cursor (desktop).
          if (isDropMode || isCalibrateMode || !containerRef.current || !baseViewportRef.current) return;
          const { canvasX, canvasY } = toCanvasPoint(e.clientX, e.clientY);
          const hit = hitTestPin(canvasX, canvasY);
          if (hit) {
            e.preventDefault();
            setPinMenu({ x: e.clientX, y: e.clientY, id: hit.id, iconNo: hit.iconNo });
          }
        }}
      >
        <canvas
          ref={canvasRef}
          className="bg-white shadow-lg"
          style={{
            display: 'block',
            position: 'absolute',
            left: 0,
            top: 0,
            transform: `translate(${panX}px, ${panY}px) scale(${scale / 2})`,
            transformOrigin: '0 0',
            transition: 'none',
          }}
        />

        {/* Pin + grid overlay — same size/transform as the PDF canvas, on top,
            transparent, and click-through so it never blocks pin placement. */}
        <canvas
          ref={overlayRef}
          style={{
            display: 'block',
            position: 'absolute',
            left: 0,
            top: 0,
            transform: `translate(${panX}px, ${panY}px) scale(${scale / 2})`,
            transformOrigin: '0 0',
            transition: 'none',
            pointerEvents: 'none',
          }}
        />

        {/* Marquee Selection Rectangle */}
        {isSelectMode && marqueeStart && marqueeEnd && (
          <div
            style={{
              position: 'absolute',
              left: Math.min(marqueeStart.x, marqueeEnd.x),
              top: Math.min(marqueeStart.y, marqueeEnd.y),
              width: Math.abs(marqueeEnd.x - marqueeStart.x),
              height: Math.abs(marqueeEnd.y - marqueeStart.y),
              border: '2px dashed rgb(59, 130, 246)',
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              pointerEvents: 'none',
              zIndex: 30,
            }}
          />
        )}

        {/* Bottom Center Navigation Buttons */}
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-40 flex items-center gap-2 bg-card border border-border rounded-lg p-2 shadow-lg">
          {/* Previous Button */}
          <button
            disabled={activePage <= 1}
            onClick={() => handlePageChange(-1)}
            className="p-2 rounded bg-secondary hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Previous page"
          >
            <ChevronLeft size={20} className="text-foreground" />
          </button>

          {/* Floor Name and Page Counter — fixed width so the arrows don't shift
              as the floor name length changes. */}
          <div className="text-foreground text-sm font-medium px-2 w-32 text-center">
            <div className="truncate" title={floorNames[activePage] || `Page ${activePage}`}>{floorNames[activePage] || `Page ${activePage}`}</div>
            <div className="text-xs text-muted-foreground">{activePage}/{totalPages}</div>
          </div>

          {/* Next Button */}
          <button
            disabled={activePage >= totalPages}
            onClick={() => handlePageChange(1)}
            className="p-2 rounded bg-secondary hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Next page"
          >
            <ChevronRight size={20} className="text-foreground" />
          </button>

          {/* Divider */}
          <div className="w-px h-6 bg-border" />

          {/* Center Page Button */}
          <button
            onClick={handleReset}
            className="p-2 rounded bg-secondary hover:bg-secondary/80 transition-colors"
            title="Center page in view"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-foreground"
            >
              {/* Top-left corner */}
              <polyline points="4 9 4 4 9 4" />
              {/* Top-right corner */}
              <polyline points="15 4 20 4 20 9" />
              {/* Bottom-right corner */}
              <polyline points="20 15 20 20 15 20" />
              {/* Bottom-left corner */}
              <polyline points="9 20 4 20 4 15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Right-click / long-press pin menu at the cursor */}
      {pinMenu && (
        <>
          <div
            className="fixed inset-0 z-50"
            onClick={() => setPinMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setPinMenu(null); }}
          />
          <div
            className="fixed z-50 min-w-32 bg-card border border-border rounded-md shadow-lg py-1 text-sm"
            style={{ left: Math.min(pinMenu.x, (typeof window !== 'undefined' ? window.innerWidth : 9999) - 160), top: pinMenu.y }}
          >
            <div className="px-3 py-1 text-xs text-muted-foreground border-b border-border">Pin #{pinMenu.iconNo}</div>
            <button
              onClick={() => { onPinRemoved(pinMenu.id); setPinMenu(null); }}
              className="block w-full text-left px-3 py-2 text-red-500 hover:bg-secondary"
            >
              Delete pin
            </button>
          </div>
        </>
      )}
    </div>
  );
}
