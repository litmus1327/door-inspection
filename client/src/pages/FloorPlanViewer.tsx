import { useState, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { MapPin, RotateCcw, Trash, MousePointer } from 'lucide-react';
import PDFViewer from '@/components/PDFViewer';
import InspectionModal from '@/components/InspectionModal';
import { DoorPin } from '@/types';

interface PdfEntry {
  id: string;
  file: File;
  pageOffset: number;
  pageCount: number;
}

interface FloorPlanViewerProps {
  pdfEntries: PdfEntry[];
  pdfDocuments: Map<string, pdfjsLib.PDFDocumentProxy>;
  totalPages: number;
  pins: Record<number, DoorPin[]>;
  floorNames: Record<number, string>;
  currentPage: number;
  initialPage?: number;
  onPageChange: (page: number) => void;
  onPinAdded: (pin: DoorPin) => void;
  onPinRemoved: (pinId: string) => void;
  onPinsRemoved: (pinIds: Set<string>) => void;
  onPinStatusChanged: (pinId: string, status: DoorPin['status']) => void;
  onPinSelected: (pin: DoorPin) => void;
  onTotalPagesChange: (pages: number) => void;
  onFloorNameExtracted?: (pageNum: number, name: string) => void;
}

export default function FloorPlanViewer({
  pdfEntries,
  pdfDocuments,
  totalPages,
  pins,
  floorNames,
  currentPage,
  initialPage,
  onPageChange,
  onPinAdded,
  onPinRemoved,
  onPinsRemoved,
  onPinStatusChanged,
  onPinSelected,
  onTotalPagesChange,
  onFloorNameExtracted,
}: FloorPlanViewerProps) {
  const [isDropMode, setIsDropMode] = useState(false);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedPin, setSelectedPin] = useState<DoorPin | null>(null);
  const [selectedPinIds, setSelectedPinIds] = useState<Set<string>>(new Set());
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Clear selection when switching modes or pages
  useEffect(() => {
    setSelectedPinIds(new Set());
  }, [isDropMode, currentPage]);

  // Listen for ESC key to exit drop/select mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsDropMode(false);
        setIsSelectMode(false);
        setSelectedPinIds(new Set());
      }
    };
    const handleExitDropMode = () => {
      setIsDropMode(false);
    };
    const handleToggleDropMode = () => {
      setIsDropMode((prev) => !prev);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('exitDropMode', handleExitDropMode);
    window.addEventListener('toggleDropMode', handleToggleDropMode);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('exitDropMode', handleExitDropMode);
      window.removeEventListener('toggleDropMode', handleToggleDropMode);
    };
  }, []);

  // Listen for pinStatusUpdate custom event
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      const { pinId, status } = e.detail;
      onPinStatusChanged(pinId, status);
    };
    window.addEventListener('pinStatusUpdate', handler as EventListener);
    return () => window.removeEventListener('pinStatusUpdate', handler as EventListener);
  }, [onPinStatusChanged]);

  // Handle Delete/Backspace key to remove selected pins
  useEffect(() => {
    const handleDeleteKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement) return;
      if (selectedPinIds.size === 0) return;

      e.preventDefault();
      onPinsRemoved(selectedPinIds);
      setSelectedPinIds(new Set());
    };

    document.addEventListener('keydown', handleDeleteKey);
    return () => document.removeEventListener('keydown', handleDeleteKey);
  }, [selectedPinIds, onPinsRemoved]);

  const handlePageChange = (newPage: number) => {
    onPageChange(newPage);
  };

  const handlePinSelected = (pin: DoorPin) => {
    const currentPagePins = pins[currentPage] || [];
    const updatedPin = currentPagePins.find((p) => p.id === pin.id) || pin;
    setSelectedPin(updatedPin);
    onPinSelected(updatedPin);
  };

  const handleSavePin = (updatedPin: DoorPin) => {
    // Pin updates are handled by parent through onPinStatusChanged
    setIsModalOpen(false);
  };

  return (
    <div className="relative w-full h-full bg-background overflow-hidden">
      {/* PDF Viewer */}
      <PDFViewer
        pdfEntries={pdfEntries}
        pdfDocuments={pdfDocuments}
        totalPages={totalPages}
        pins={pins[currentPage] || []}
        onPinAdded={onPinAdded}
        onPinRemoved={onPinRemoved}
        onPinStatusChanged={onPinStatusChanged}
        onPageChange={handlePageChange}
        onPinSelected={handlePinSelected}
        isDropMode={isDropMode}
        isSelectMode={isSelectMode}
        selectedPinIds={selectedPinIds}
        onSelectionChange={setSelectedPinIds}
        onTotalPagesChange={onTotalPagesChange}
        onFloorNameExtracted={onFloorNameExtracted}
        initialPage={initialPage}
      />

      {/* Fieldwire-style Markup Toolbar - Bottom Right */}
      <div className="fixed bottom-4 right-4 z-40 flex flex-col gap-2">
        {/* Pin Tool - Always visible, highlighted when active */}
        <button
          onClick={() => {
            setIsDropMode(!isDropMode);
            if (isSelectMode) setIsSelectMode(false);
          }}
          className={`p-3 rounded-lg shadow-lg transition-all ${
            isDropMode
              ? 'bg-blue-500 text-white hover:bg-blue-600'
              : 'bg-gray-700 text-white hover:bg-gray-600'
          }`}
          title={isDropMode ? 'Exit drop mode' : 'Drop pins'}
        >
          <MapPin size={20} />
        </button>

        {/* Select Mode Tool */}
        <button
          onClick={() => {
            setIsSelectMode(!isSelectMode);
            if (isDropMode) setIsDropMode(false);
          }}
          className={`p-3 rounded-lg shadow-lg transition-all ${
            isSelectMode
              ? 'bg-purple-500 text-white hover:bg-purple-600'
              : 'bg-gray-700 text-white hover:bg-gray-600'
          }`}
          title={isSelectMode ? 'Exit select mode' : 'Select pins'}
        >
          <MousePointer size={20} />
        </button>

        {/* Undo Button */}
        <button
          onClick={() => {
            if ((pins[currentPage] || []).length > 0) {
              const lastPin = (pins[currentPage] || [])[(pins[currentPage] || []).length - 1];
              onPinRemoved(lastPin.id);
            }
          }}
          disabled={(pins[currentPage] || []).length === 0}
          className="p-3 rounded-lg shadow-lg bg-gray-700 text-white hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          title="Undo last pin"
        >
          <RotateCcw size={20} />
        </button>

        {/* Clear All Button */}
        <button
          onClick={() => {
            if ((pins[currentPage] || []).length > 0 && confirm('Delete all pins on this page?')) {
              const pinIds = (pins[currentPage] || []).map(p => p.id);
              // Remove pins from state (App.tsx handles localStorage cleanup)
              pinIds.forEach((pinId) => {
                onPinRemoved(pinId);
              });
              setSelectedPin(null);
            }
          }}
          disabled={(pins[currentPage] || []).length === 0}
          className="p-3 rounded-lg shadow-lg bg-gray-700 text-white hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          title="Clear all pins"
        >
          <Trash size={20} />
        </button>

        {/* Delete Selected Button - Only show when pins are selected */}
        {selectedPinIds.size > 0 && (
          <button
            onClick={() => {
              if (confirm(`Delete ${selectedPinIds.size} selected pin(s)?`)) {
                // Remove pins from state (App.tsx handles localStorage cleanup)
                selectedPinIds.forEach((pinId) => {
                  onPinRemoved(pinId);
                });
                setSelectedPinIds(new Set());
                setSelectedPin(null);
              }
            }}
            className="p-3 rounded-lg shadow-lg bg-red-600 text-white hover:bg-red-700 transition-all"
            title={`Delete ${selectedPinIds.size} selected pin(s)`}
          >
            <Trash size={20} /> <span className="ml-1 text-xs font-semibold">({selectedPinIds.size})</span>
          </button>
        )}

      </div>

      {/* Inspection Modal */}
      <InspectionModal
        pin={selectedPin}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSavePin}
        onStatusChange={onPinStatusChanged}
        onRemove={onPinRemoved}
        allPins={Object.values(pins).flat()}
      />
    </div>
  );
}
