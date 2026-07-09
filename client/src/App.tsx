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
import ProjectsPage from './pages/ProjectsPage';
import FloorPlanViewer from './pages/FloorPlanViewer';
import InspectionWizard from './pages/InspectionWizard';
import RecordsTab from './pages/RecordsTab';
import ConfigTab from './pages/ConfigTab';
import Plans from './pages/Plans';
import { useLocalStorage } from './hooks/useLocalStorage';
import { getSupabaseConfig, upsertPin, deletePin, fetchPins, uploadPlanPDF, downloadPlanPDF, planExistsInCloud } from './lib/supabase';
import { syncInspections, flushPendingPhotos } from './lib/sync';
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
  // The active project gates the app: with none chosen, we show the Projects
  // page (pick your name + pick/create a project) instead of a setup wizard.
  const [activeProject, setActiveProject] = useLocalStorage('activeProject', '');
  const [inspectorName] = useLocalStorage('inspectorName', '');
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

  // Persist ALL uploaded PDFs (ordered), not just the first. The previous
  // single-key scheme silently dropped every PDF after the first on reload.
  const idbKey = (project: string) => `floorplans__${project}`;

  const savePDFsToIDB = async (files: File[], project: string) => {
    if (!project) return;
    try {
      const db = await openDB();
      // Await commit so a subsequent read (e.g. the restore effect right after
      // creating a project) reliably sees the plan.
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('files', 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.objectStore('files').put({
          id: idbKey(project),
          files: files.map((f) => ({ name: f.name, file: f })),
        });
      });
    } catch (err) {
      console.error('Error saving PDFs to IndexedDB:', err);
    }
  };

  const loadPDFsFromIDB = async (project: string): Promise<File[]> => {
    if (!project) return [];
    try {
      const db = await openDB();
      const store = db.transaction('files', 'readonly').objectStore('files');
      const get = (key: string): Promise<any> =>
        new Promise((resolve) => {
          const req = store.get(key);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => resolve(null);
        });
      const multi = await get(idbKey(project));
      if (multi?.files?.length) {
        return multi.files.map((x: { file: File }) => x.file).filter(Boolean);
      }
      return [];
    } catch (err) {
      console.error('Error loading PDFs from IndexedDB:', err);
      return [];
    }
  };

  // Restore the ACTIVE project's plan: local IndexedDB first, else pull from the
  // cloud. Re-runs when the project changes so switching projects loads the
  // right plan. If a local plan exists but the cloud lacks it, push it up once.
  useEffect(() => {
    if (!activeProject) {
      setPdfEntries([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const cfg = getSupabaseConfig();
      let files = await loadPDFsFromIDB(activeProject);
      if (files.length > 0) {
        if (cfg.url && cfg.key) {
          const exists = await planExistsInCloud(cfg, activeProject);
          if (!exists) uploadPlanPDF(cfg, files[0], activeProject).catch(() => {});
        }
      } else if (cfg.url && cfg.key) {
        const blob = await downloadPlanPDF(cfg, activeProject);
        if (blob && blob.size > 0) {
          const file = new File([blob], 'floor-plan.pdf', { type: 'application/pdf' });
          files = [file];
          savePDFsToIDB(files, activeProject);
        }
      }
      if (cancelled) return;
      setPdfEntries(
        files.map((file) => ({
          id: crypto.randomUUID(),
          file,
          pageOffset: 0,
          pageCount: 0,
        }))
      );
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject]);

  // Pin sync + multi-inspector presence.
  //  - On mount: push local pins up, then pull this project's cloud pins as the
  //    source of truth (project-filtered so other jobs' pins don't leak in).
  //  - In the background: periodically and on window focus, ADD any new pins
  //    peers have placed (merge-only, so a pin you just dropped is never wiped
  //    by a poll that raced its upload). Deletions reconcile on next full load.
  useEffect(() => {
    const cfg = getSupabaseConfig();
    if (!cfg.url || !cfg.key) return;
    const project = () => localStorage.getItem('activeProject') || undefined;

    const mergePeerPins = async () => {
      const cloud = await fetchPins(cfg, project());
      if (!cloud) return;
      setPins((prev) => {
        const haveIds = new Set(Object.values(prev).flat().map((p) => p.id));
        const next = { ...prev };
        let changed = false;
        for (const p of cloud) {
          if (!p || !p.id || haveIds.has(p.id)) continue;
          const page = p.pageNumber || 1;
          next[page] = [...(next[page] || []), p];
          changed = true;
        }
        return changed ? next : prev;
      });
    };

    (async () => {
      try {
        const local: Record<number, DoorPin[]> = JSON.parse(
          localStorage.getItem('floorPlanPins') || '{}'
        );
        for (const p of Object.values(local).flat()) {
          await upsertPin(cfg, p);
        }
        flushPendingPhotos().catch(() => {});
        const cloud = await fetchPins(cfg, project());
        if (cloud) {
          const grouped: Record<number, DoorPin[]> = {};
          for (const p of cloud) {
            const page = (p && p.pageNumber) || 1;
            (grouped[page] = grouped[page] || []).push(p);
          }
          setPins(grouped);
        }
      } catch {
        /* offline — keep local pins */
      }
    })();

    const interval = window.setInterval(() => {
      if (navigator.onLine) mergePeerPins().catch(() => {});
    }, 25000);
    const onFocus = () => {
      if (navigator.onLine) mergePeerPins().catch(() => {});
    };
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject]);

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

  // Persist all PDFs to IDB (ordered, per project) so every uploaded plan
  // survives reload.
  useEffect(() => {
    if (pdfEntries.length > 0 && activeProject) {
      savePDFsToIDB(pdfEntries.map((e) => e.file), activeProject);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfEntries, activeProject]);

  // Update sync status based on online/offline, and flush pending work when
  // connectivity returns (previously the app only recorded the status string).
  useEffect(() => {
    const updateSyncStatus = () => {
      localStorage.setItem('syncStatus', navigator.onLine ? 'online' : 'offline');
    };
    const handleOnline = () => {
      updateSyncStatus();
      const cfg = getSupabaseConfig();
      if (cfg.url && cfg.key) {
        // Push anything captured offline and pull peers' work.
        syncInspections().catch(() => {});
        flushPendingPhotos().catch(() => {});
        const local: Record<number, DoorPin[]> = JSON.parse(
          localStorage.getItem('floorPlanPins') || '{}'
        );
        Object.values(local).flat().forEach((p) => upsertPin(cfg, p).catch(() => {}));
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', updateSyncStatus);
    updateSyncStatus();

    return () => {
      window.removeEventListener('online', handleOnline);
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

  const cloudUpsertPin = (pin: DoorPin) => {
    const cfg = getSupabaseConfig();
    if (cfg.url && cfg.key) upsertPin(cfg, pin).catch(() => {});
  };
  const cloudDeletePin = (id: string) => {
    const cfg = getSupabaseConfig();
    if (cfg.url && cfg.key) deletePin(cfg, id).catch(() => {});
  };

  const handlePDFUpload = (file: File) => {
    // Accept by extension as well as MIME type — mobile file pickers often
    // report a PDF with an empty or non-standard type, which silently dropped it.
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    if (!isPdf) {
      alert('That doesn’t look like a PDF. Please choose a PDF floor plan.');
      return;
    }
    const newEntry: PdfEntry = {
      id: crypto.randomUUID(),
      file,
      pageOffset: 0,
      pageCount: 0,
    };
    setPdfEntries((prev) => [...prev, newEntry]);
    const cfg = getSupabaseConfig();
    if (cfg.url && cfg.key && activeProject) uploadPlanPDF(cfg, file, activeProject).catch(() => {});
  };

  // Create a project from the Projects page: cache its plan locally (so it
  // opens instantly, even offline), upload it, then activate the project.
  const handleCreateProject = async (name: string, plan: File) => {
    await savePDFsToIDB([plan], name);
    const cfg = getSupabaseConfig();
    if (cfg.url && cfg.key) uploadPlanPDF(cfg, plan, name).catch(() => {});
    setActiveProject(name);
  };

  const handlePinAdded = (pin: DoorPin) => {
    // Next number = highest existing iconNo + 1 (not a count, which would
    // reuse a number after a deletion and collide with an existing pin).
    const maxNo = Object.values(pins)
      .flat()
      .reduce((m, p) => Math.max(m, parseInt(p.iconNo) || 0), 0);
    const pinWithNumber: DoorPin = {
      ...pin,
      iconNo: String(maxNo + 1),
      pageNumber: currentPage,
      owner: inspectorName || undefined,
    };
    setPins((prev) => ({
      ...prev,
      [currentPage]: [...(prev[currentPage] || []), pinWithNumber],
    }));
    cloudUpsertPin(pinWithNumber);
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
    cloudDeletePin(pinId);
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
    pinIds.forEach((id) => cloudDeletePin(id));
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
    const found = Object.values(pins).flat().find((p) => p.id === pinId);
    if (found) cloudUpsertPin({ ...found, status });
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

  // No project chosen yet → show the Projects page (pick your name, pick or
  // create a project). This replaces the old name/project/Supabase setup wizard.
  if (!activeProject) {
    return (
      <ErrorBoundary>
        <ThemeProvider defaultTheme="light" switchable>
          <TooltipProvider>
            <Toaster />
            <ProjectsPage
              onSelectProject={(name) => setActiveProject(name)}
              onCreateProject={handleCreateProject}
            />
          </TooltipProvider>
        </ThemeProvider>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light" switchable>
        <TooltipProvider>
          <Toaster />
          <div className="flex bg-background text-foreground" style={{ height: '100dvh' }}>
            {/* Sidebar */}
            <Sidebar
              activeTab={activeTab}
              onTabChange={(tab) => setActiveTab(tab as TabType)}
              isOpen={sidebarOpen}
              onClose={() => setSidebarOpen(false)}
              activeProject={activeProject}
              onSwitchProject={() => { setSidebarOpen(false); setActiveProject(''); }}
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
                        className="pointer-events-auto w-full md:w-[42vw] md:min-w-[420px] overflow-hidden bg-background md:border-l md:border-r border-border shadow-2xl"
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
