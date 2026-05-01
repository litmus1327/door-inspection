import { useState, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker
if (typeof pdfjsLib.GlobalWorkerOptions !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
}
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import ErrorBoundary from './components/ErrorBoundary';
import { ThemeProvider } from './contexts/ThemeContext';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import Setup from './pages/Setup';
import FloorPlanViewer from './pages/FloorPlanViewer';
import InspectionWizard from './pages/InspectionWizard';
import RecordsTab from './pages/RecordsTab';
import ConfigTab from './pages/ConfigTab';
import Plans from './pages/Plans';
import { useLocalStorage } from './hooks/useLocalStorage';
import { DoorPin } from './types';

type TabType = 'plans' | 'inspect' | 'records' | 'config';

interface PdfEntry {
  id: string;
  file: File;
  pageOffset: number;
  pageCount: number;
}

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('plans');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [inspectorName] = useLocalStorage('inspectorName', '');
  const [showSetup, setShowSetup] = useState(!inspectorName);
  const [selectedDoor, setSelectedDoor] = useState<{
    pinId?: string;
    assetId: string | null;
    iconNo: string;
    floor: string;
    grid: string;
    assemblyType: string;
    doorRating: string;
  } | null>(null);


  // Multi-PDF support
  const [pdfEntries, setPdfEntries] = useState<PdfEntry[]>([]);
  const [pdfDocuments, setPdfDocuments] = useState<Map<string, pdfjsLib.PDFDocumentProxy>>(new Map());
  const [totalPages, setTotalPages] = useState(0);
  const [pins, setPins] = useLocalStorage<Record<number, DoorPin[]>>('floorPlanPins', {});
  const [floorNames, setFloorNames] = useState<Record<number, string>>({});
  const [currentPage, setCurrentPage] = useState(1);

  // IndexedDB helpers for PDF persistence
  const openDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('codify_floorplan', 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('files', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  };

  const savePDFToIDB = async (file: File) => {
    try {
      const db = await openDB();
      const tx = db.transaction('files', 'readwrite');
      await tx.objectStore('files').put({ id: 'floorplan', file, name: file.name });
    } catch (err) {
      console.error('Error saving PDF to IndexedDB:', err);
    }
  };

  const loadPDFFromIDB = async (): Promise<File | null> => {
    try {
      const db = await openDB();
      const tx = db.transaction('files', 'readonly');
      const req = tx.objectStore('files').get('floorplan');
      return new Promise((resolve) => {
        req.onsuccess = () => resolve(req.result?.file || null);
        req.onerror = () => resolve(null);
      });
    } catch (err) {
      console.error('Error loading PDF from IndexedDB:', err);
      return null;
    }
  };

  // Restore PDFs on mount
  useEffect(() => {
    loadPDFFromIDB().then((file) => {
      if (file) {
        const entry: PdfEntry = {
          id: crypto.randomUUID(),
          file,
          pageOffset: 0,
          pageCount: 0,
        };
        setPdfEntries([entry]);
      }
    });
  }, []);

  // Load all PDF documents
  useEffect(() => {
    const loadPdfs = async () => {
      const newDocs = new Map<string, pdfjsLib.PDFDocumentProxy>();
      let totalPageCount = 0;
      const updatedEntries = [...pdfEntries];

      for (let i = 0; i < updatedEntries.length; i++) {
        const entry = updatedEntries[i];
        try {
          const arrayBuffer = await entry.file.arrayBuffer();
          const doc = await pdfjsLib.getDocument(arrayBuffer).promise;
          newDocs.set(entry.id, doc);
          
          // Update page offset and count
          entry.pageOffset = totalPageCount;
          entry.pageCount = doc.numPages;
          totalPageCount += doc.numPages;
        } catch (err) {
          console.error(`Failed to load PDF ${entry.file.name}:`, err);
        }
      }

      setPdfEntries(updatedEntries);
      setPdfDocuments(newDocs);
      setTotalPages(totalPageCount);
    };

    if (pdfEntries.length > 0) {
      loadPdfs();
    } else {
      setPdfDocuments(new Map());
      setTotalPages(0);
    }
  }, [pdfEntries.length]);

  // Save first PDF to IDB for persistence
  useEffect(() => {
    if (pdfEntries.length > 0) {
      savePDFToIDB(pdfEntries[0].file);
    }
  }, [pdfEntries]);

  // Update sync status based on online/offline
  useEffect(() => {
    const updateSyncStatus = () => {
      localStorage.setItem('syncStatus', navigator.onLine ? 'online' : 'offline');
    };
    
    window.addEventListener('online', updateSyncStatus);
    window.addEventListener('offline', updateSyncStatus);
    updateSyncStatus();

    return () => {
      window.removeEventListener('online', updateSyncStatus);
      window.removeEventListener('offline', updateSyncStatus);
    };
  }, []);

  // Resolve global page number to correct PDF and local page
  const resolveGlobalPage = (globalPage: number): {
    pdfFile: File;
    localPage: number;
    pageOffset: number;
  } | null => {
    let offset = 0;
    for (const entry of pdfEntries) {
      if (globalPage <= offset + entry.pageCount) {
        return {
          pdfFile: entry.file,
          localPage: globalPage - offset,
          pageOffset: offset,
        };
      }
      offset += entry.pageCount;
    }
    return null;
  };

  // Remove pins from Title Sheet pages
  useEffect(() => {
    if (totalPages === 0 || Object.keys(floorNames).length === 0) return;

    // Remove pins from any page labeled "Title Sheet"
    const titleSheetPages = Object.entries(floorNames)
      .filter(([, name]) => name === 'Title Sheet')
      .map(([page]) => Number(page));

    if (titleSheetPages.length === 0) return;

    const hasTitleSheetPins = titleSheetPages.some(
      (page) => (pins[page] || []).length > 0
    );

    if (!hasTitleSheetPins) return;

    setPins((prev) => {
      const next = { ...prev };
      titleSheetPages.forEach((page) => {
        next[page] = [];
      });
      return next;
    });
  }, [floorNames]);

  const handlePDFUpload = (file: File) => {
    if (file.type === 'application/pdf') {
      const newEntry: PdfEntry = {
        id: crypto.randomUUID(),
        file,
        pageOffset: 0,
        pageCount: 0,
      };
      setPdfEntries((prev) => [...prev, newEntry]);
    }
  };

  const handlePinAdded = (pin: DoorPin) => {
    setPins((prev) => {
      // Count total pins across ALL pages and ALL pdf entries for global sequence
      const totalPins = Object.values(prev).reduce(
        (sum, pagePins) => sum + pagePins.length,
        0
      );
      const nextIconNo = String(totalPins + 1);
      const pinWithNumber = { ...pin, iconNo: nextIconNo };

      return {
        ...prev,
        [currentPage]: [...(prev[currentPage] || []), pinWithNumber],
      };
    });
  };

  const handlePinRemoved = (pinId: string) => {
    // Purge matching inspection records from localStorage
    const existing = JSON.parse(localStorage.getItem('doorInspections') || '[]');
    const filtered = existing.filter((r: any) => r.pinId !== pinId);
    localStorage.setItem('doorInspections', JSON.stringify(filtered));

    // Remove pin from state
    setPins((prev) => {
      const next: Record<number, DoorPin[]> = {};
      Object.keys(prev).forEach((pageKey) => {
        const page = Number(pageKey);
        next[page] = (prev[page] || []).filter((p) => p.id !== pinId);
      });
      return next;
    });
  };

  const handlePinsRemoved = (pinIds: Set<string>) => {
    // Purge all matching inspection records from localStorage
    const existing = JSON.parse(localStorage.getItem('doorInspections') || '[]');
    const filtered = existing.filter((r: any) => !pinIds.has(r.pinId));
    localStorage.setItem('doorInspections', JSON.stringify(filtered));

    // Remove pins from state
    setPins((prev) => {
      const next: Record<number, DoorPin[]> = {};
      Object.keys(prev).forEach((pageKey) => {
        const page = Number(pageKey);
        next[page] = (prev[page] || []).filter((p) => !pinIds.has(p.id));
      });
      return next;
    });
  };

  const handlePinStatusChanged = (pinId: string, status: DoorPin['status']) => {
    setPins((prev) => {
      const next = { ...prev };
      for (const page in next) {
        next[page] = next[page].map((p) =>
          p.id === pinId ? { ...p, status } : p
        );
      }
      return next;
    });
  };

  const handlePinSelected = (pin: DoorPin) => {
    const currentPagePins = pins[currentPage] || [];
    const updatedPin = currentPagePins.find((p) => p.id === pin.id) || pin;
    setSelectedDoor({
      pinId: pin.id,
      assetId: updatedPin.assetId,
      iconNo: updatedPin.iconNo,
      floor: floorNames[currentPage] || String(currentPage),
      grid: updatedPin.gridBlock || '',
      assemblyType: '',
      doorRating: '',
    });
  };

  const handleFloorNameExtracted = (pageNum: number, name: string) => {
    setFloorNames((prev) => ({ ...prev, [pageNum]: name }));
  };

  if (showSetup) {
    return (
      <ErrorBoundary>
        <ThemeProvider defaultTheme="dark">
          <TooltipProvider>
            <Toaster />
            <Setup onComplete={() => setShowSetup(false)} />
          </TooltipProvider>
        </ThemeProvider>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <div className="flex bg-background text-foreground" style={{ height: '100dvh' }}>
            {/* Sidebar */}
            <Sidebar
              activeTab={activeTab}
              onTabChange={(tab) => setActiveTab(tab as TabType)}
              isOpen={sidebarOpen}
              onClose={() => setSidebarOpen(false)}
            />

            {/* Main Content */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {/* Header */}
              <Header onMenuClick={() => setSidebarOpen(true)} />

              {/* Content */}
              <main className="flex-1 overflow-hidden relative">
                {/* Floor plan always in background */}
                <Plans
                  pdfEntries={pdfEntries}
                  pdfDocuments={pdfDocuments}
                  totalPages={totalPages}
                  pins={pins}
                  floorNames={floorNames}
                  onPDFUpload={handlePDFUpload}
                  onPinAdded={handlePinAdded}
                  onPinRemoved={handlePinRemoved}
                  onPinsRemoved={handlePinsRemoved}
                  onPinStatusChanged={handlePinStatusChanged}
                  onPinSelected={handlePinSelected}
                  onFloorNameExtracted={handleFloorNameExtracted}
                  onPageSelected={(page) => setCurrentPage(page)}
                />

                {/* Wizard as centered overlay */}
                {selectedDoor && (
                  <>
                    {/* Backdrop — clicking it dismisses the wizard */}
                    <div
                      className="fixed inset-x-0 top-0 bg-black/50 z-40"
                      style={{ height: '100dvh' }}
                      onClick={() => setSelectedDoor(null)}
                    />

                    {/* Centered panel */}
                    <div className="fixed inset-x-0 top-0 z-50 flex items-stretch justify-center pointer-events-none" style={{ height: '100dvh' }}>
                      <div
                        className="pointer-events-auto w-[42vw] min-w-[320px] overflow-hidden bg-background border-l border-r border-border shadow-2xl"
                        style={{ height: '100dvh' }}
                      >
                        <InspectionWizard
                          selectedDoor={selectedDoor}
                          onClear={() => setSelectedDoor(null)}
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* Records tab overlay */}
                {activeTab === 'records' && (
                  <div className="absolute inset-0 z-40 bg-background overflow-auto">
                    <RecordsTab />
                  </div>
                )}

                {/* Config tab overlay */}
                {activeTab === 'config' && (
                  <div className="absolute inset-0 z-40 bg-background overflow-auto">
                    <ConfigTab />
                  </div>
                )}
              </main>
            </div>
          </div>


        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
