import { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { Loader2, Upload, ChevronLeft } from 'lucide-react';
import FloorPlanViewer from './FloorPlanViewer';
import { DoorPin } from '@/types';
import { useLocalStorage } from '@/hooks/useLocalStorage';

interface PdfEntry {
  id: string;
  file: File;
  pageOffset: number;
  pageCount: number;
}

interface PlansProps {
  pdfEntries: PdfEntry[];
  pdfDocuments: Map<string, pdfjsLib.PDFDocumentProxy>;
  totalPages: number;
  pins: Record<number, DoorPin[]>;
  floorNames: Record<number, string>;
  onPDFUpload: (file: File) => void;
  onPinAdded: (pin: DoorPin) => void;
  onPinRemoved: (pinId: string) => void;
  onPinsRemoved: (pinIds: Set<string>) => void;
  onPinStatusChanged: (pinId: string, status: DoorPin['status']) => void;
  onPinSelected: (pin: DoorPin) => void;
  onFloorNameExtracted?: (pageNum: number, name: string) => void;
  onPageSelected?: (page: number) => void;
}

export default function Plans({
  pdfEntries,
  pdfDocuments,
  totalPages,
  pins,
  floorNames,
  onPDFUpload,
  onPinAdded,
  onPinRemoved,
  onPinsRemoved,
  onPinStatusChanged,
  onPinSelected,
  onFloorNameExtracted,
  onPageSelected,
}: PlansProps) {
  const [thumbnails, setThumbnails] = useState<Record<number, string>>({});
  const [loadingPages, setLoadingPages] = useState<Set<number>>(new Set());
  const [selectedPage, setSelectedPage] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [checkedPages, setCheckedPages] = useState<Set<number>>(new Set());
  const [hiddenPages, setHiddenPages] = useLocalStorage<number[]>('hiddenPages', []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Generate thumbnails lazily
  useEffect(() => {
    if (pdfEntries.length === 0 || totalPages === 0) return;

    console.log('Starting extraction for', totalPages, 'pages');

    const generateThumbnailsAndNames = async () => {
      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        console.log(`Extracting page ${pageNum} of ${totalPages}`);
        try {
          // Find which PDF entry contains this page
          const pdfEntry = pdfEntries.find(
            (e) => pageNum >= e.pageOffset + 1 && pageNum <= e.pageOffset + e.pageCount
          );
          if (!pdfEntry) continue;
          
          const pdf = pdfDocuments.get(pdfEntry.id);
          if (!pdf) continue;
          
          const localPageNum = pageNum - pdfEntry.pageOffset;
          const page = await pdf.getPage(localPageNum);

          // ── Thumbnail ─────────────────────────────────────────
          if (!thumbnails[pageNum]) {
            setLoadingPages((prev) => new Set(prev).add(pageNum));
            try {
              const viewport = page.getViewport({ scale: 0.3 });
              const canvas = document.createElement('canvas');
              canvas.width = viewport.width;
              canvas.height = viewport.height;
              const context = canvas.getContext('2d');
              if (context) {
                await page.render({ canvasContext: context, viewport }).promise;
                setThumbnails((prev) => ({
                  ...prev,
                  [pageNum]: canvas.toDataURL('image/png'),
                }));
              }
            } finally {
              setLoadingPages((prev) => {
                const s = new Set(prev);
                s.delete(pageNum);
                return s;
              });
            }
          }

          // ── Floor name ─────────────────────────────────────────
          const textContent = await page.getTextContent();
          const items: string[] = textContent.items
            .map((i: any) => i.str.trim())
            .filter(Boolean);

          let floorName = `Page ${pageNum}`;

          // This exact order is required:
          if (items.some((s) => s.toUpperCase() === 'TITLE SHEET')) {
            // Exact string match, case-insensitive — not regex
            floorName = 'Title Sheet';
          } else {
            // Updated regex handles both dash-separated and space-only formats
            const lspItems = items.filter((s) =>
              /^.+\s*(?:-\s*)?LIFE\s*SAFETY\s*PLAN$/i.test(s) &&
              !/^SMOKE COMPARTMENTS/i.test(s)  // exclude secondary diagram titles
            );
            if (lspItems.length > 0) {
              const m = lspItems[0].match(/^(.+?)\s*(?:-\s*)?LIFE\s*SAFETY\s*PLAN$/i);
              if (m && m[1].trim()) {
                floorName = m[1].trim()
                  .split(' ')
                  .map((w: string) =>
                    w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
                  )
                  .join(' ');
              }
            }
            // Fallback: Try "X LIFESAFETY PLAN" (no space)
            if (floorName === `Page ${pageNum}`) {
              const lspNoSpace = items.find((s) =>
                /^.+LIFESAFETY\s*PLAN$/i.test(s)
              );
              if (lspNoSpace) {
                const m = lspNoSpace.match(/^(.*?)(?:\s*-\s*)?LIFESAFETY\s*PLAN$/i);
                if (m?.[1]?.trim()) {
                  floorName = m[1].trim()
                    .split(' ')
                    .map((w: string) =>
                      w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
                    )
                    .join(' ');
                }
              }
            }
          }

          // Strip trailing "Floor" from floor name
          floorName = floorName
            .replace(/\s+Floor\s*$/i, '')
            .trim();

          console.log(`Page ${pageNum}: ${floorName}`);
          onFloorNameExtracted?.(pageNum, floorName);
        } catch (err) {
          console.warn(`Page ${pageNum} processing failed:`, err);
        }

        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    };

    generateThumbnailsAndNames();
  }, [pdfEntries, pdfDocuments, totalPages]); // deps: pdfEntries, pdfDocuments, totalPages

  const visiblePages = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter((p) => !hiddenPages.includes(p));

  const getTotalPinCount = () => {
    return visiblePages.reduce((sum, pageNum) => sum + (pins[pageNum] || []).length, 0);
  };

  const getFloorName = (pageNum: number): string => {
    return floorNames[pageNum] || `Page ${pageNum}`;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onPDFUpload(file);
    }
  };

  // Hidden file input — always rendered at top level
  const fileInputElement = (
    <input
      ref={fileInputRef}
      type="file"
      accept=".pdf"
      onChange={handleFileSelect}
      className="hidden"
    />
  );

  // State 1: No PDF uploaded yet
  if (pdfEntries.length === 0) {
    return (
      <>
        {fileInputElement}
        <div className="w-full h-full bg-background flex items-center justify-center">
          <div className="text-center">
            <div className="mb-6">
              <Upload size={64} className="mx-auto text-muted-foreground" />
            </div>
            <h2 className="text-2xl font-semibold mb-2">Upload Floor Plan</h2>
            <p className="text-muted-foreground mb-6">Upload a PDF to get started</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all"
            >
              Choose PDF
            </button>
          </div>
        </div>
      </>
    );
  }

  // State 2: Drill-down floor plan viewer
  if (selectedPage !== null) {
    return (
      <div className="w-full h-full bg-background overflow-hidden flex flex-col">
        {/* Back button header */}
        <div className="flex items-center gap-4 p-4 border-b border-border bg-card">
          <button
            onClick={() => setSelectedPage(null)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted transition-all text-foreground"
          >
            <ChevronLeft size={20} />
            <span>Back to Plans</span>
          </button>
          <div className="flex-1">
            <h2 className="text-lg font-semibold">{getFloorName(selectedPage)}</h2>
            <p className="text-sm text-muted-foreground">Page {selectedPage} of {totalPages}</p>
          </div>
        </div>

        {/* Floor plan viewer */}
        <div className="flex-1 overflow-hidden">
          <FloorPlanViewer
            pdfEntries={pdfEntries}
            pdfDocuments={pdfDocuments}
            totalPages={totalPages}
            pins={pins}
            floorNames={floorNames}
            currentPage={selectedPage}
            initialPage={selectedPage}
            onPageChange={setCurrentPage}
            onPinAdded={onPinAdded}
            onPinRemoved={onPinRemoved}
            onPinsRemoved={onPinsRemoved}
            onPinStatusChanged={onPinStatusChanged}
            onPinSelected={onPinSelected}
            onTotalPagesChange={() => {}}
            onFloorNameExtracted={onFloorNameExtracted}
          />
        </div>
      </div>
    );
  }

  // State 3: Thumbnail grid
  return (
    <>
      {fileInputElement}
      <div className="w-full h-full bg-background overflow-auto p-6">
      <div className="mb-6">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <h1 className="text-3xl font-bold">Plans</h1>
            <p className="text-sm text-muted-foreground">
              {getTotalPinCount()} pins across {visiblePages.length} visible page{visiblePages.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="shrink-0 px-3 py-2 bg-primary text-primary-foreground rounded text-sm font-semibold hover:bg-primary/90 transition-all"
          >
            + Add PDF
          </button>
        </div>

        {/* Action buttons row — wraps on mobile */}
        <div className="flex flex-wrap gap-2">
          {hiddenPages.length > 0 && (
            <button
              onClick={() => setHiddenPages([])}
              className="px-3 py-2 bg-secondary border border-border rounded text-sm hover:bg-secondary/80 transition-all"
            >
              Restore Hidden ({hiddenPages.length})
            </button>
          )}
          {visiblePages.length > 0 && (
            <button
              onClick={() => {
                if (checkedPages.size === visiblePages.length) {
                  setCheckedPages(new Set());
                } else {
                  setCheckedPages(new Set(visiblePages));
                }
              }}
              className="px-3 py-2 bg-secondary border border-border rounded text-sm font-semibold hover:bg-secondary/80 transition-all"
            >
              {checkedPages.size === visiblePages.length ? 'Deselect All' : 'Select All'}
            </button>
          )}
          {checkedPages.size > 0 && (
            <button
              onClick={() => {
                if (confirm(`Hide ${checkedPages.size} page(s)? Use "Restore Hidden" to undo.`)) {
                  setHiddenPages((prev) => Array.from(new Set([...prev, ...Array.from(checkedPages)])));
                  setCheckedPages(new Set());
                }
              }}
              className="px-3 py-2 bg-red-600 text-white rounded text-sm font-semibold hover:bg-red-700 transition-all"
            >
              Delete Selected ({checkedPages.size})
            </button>
          )}
        </div>
      </div>

      {visiblePages.length === 0 && pdfEntries.length > 0 && (
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <p className="text-muted-foreground">All pages are hidden.</p>
          <button
            onClick={() => setHiddenPages([])}
            className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm font-semibold hover:bg-primary/90 transition-all"
          >
            Restore All Pages
          </button>
        </div>
      )}

      {/* Thumbnail Grid */}
      <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-7 gap-3">
        {visiblePages.map((pageNum) => {
          // Find which PDF entry contains this page
          const pdfEntry = pdfEntries.find(
            (e) => pageNum >= e.pageOffset + 1 && pageNum <= e.pageOffset + e.pageCount
          );
          const localPageNum = pdfEntry ? pageNum - pdfEntry.pageOffset : pageNum;
          const pdf = pdfEntry ? pdfDocuments.get(pdfEntry.id) : null;
          const pinCount = (pins[pageNum] || []).length;
          const isLoading = loadingPages.has(pageNum);

          return (
            <div
              key={pageNum}
              onClick={() => {
                setSelectedPage(pageNum);
                onPageSelected?.(pageNum);
              }}
              className="group cursor-pointer"
            >
              {/* Thumbnail Card */}
              <div className="relative aspect-[1/1] bg-card rounded-lg overflow-hidden border border-border hover:border-primary hover:shadow-lg transition-all duration-200 hover:scale-105">
                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={checkedPages.has(pageNum)}
                  onChange={(e) => {
                    e.stopPropagation();
                    setCheckedPages((prev) => {
                      const next = new Set(prev);
                      next.has(pageNum) ? next.delete(pageNum) : next.add(pageNum);
                      return next;
                    });
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className={`absolute top-2 left-2 z-10 w-5 h-5 cursor-pointer transition-opacity ${
                    checkedPages.size > 0 ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                />

                {/* Thumbnail Image */}
                {thumbnails[pageNum] ? (
                  <img
                    src={thumbnails[pageNum]}
                    alt={`Page ${pageNum}`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-muted">
                    {isLoading ? (
                      <Loader2 size={24} className="animate-spin text-muted-foreground" />
                    ) : pdf ? (
                      <span className="text-sm text-muted-foreground">Loading...</span>
                    ) : (
                      <span className="text-sm text-muted-foreground">PDF Error</span>
                    )}
                  </div>
                )}

                {/* Pin Count Badge */}
                {pinCount > 0 && (
                  <div className="absolute top-2 right-2 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold shadow-lg">
                    {pinCount > 99 ? '99+' : pinCount}
                  </div>
                )}
              </div>

              {/* Floor Name Label */}
              <div className="mt-2 text-center">
                <p className="font-medium truncate text-sm">{getFloorName(pageNum)}</p>
                <p className="text-xs text-muted-foreground">Page {pageNum} of {totalPages}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
    </>
  );
}
