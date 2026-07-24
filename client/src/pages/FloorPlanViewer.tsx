import { useState, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { MapPin, RotateCcw, Trash, MousePointer, Palette, SlidersHorizontal } from 'lucide-react';
import PDFViewer from '@/components/PDFViewer';
import WallCalibration from '@/components/WallCalibration';
import ProjectSetupPanel from '@/components/ProjectSetupPanel';
import { DoorPin } from '@/types';
import {
  ProjectCalibration, WallPick, loadCalibration, saveCalibration, emptyCalibration,
} from '@/lib/wallDetect';
import { ProjectSetup, loadProjectSetup, saveProjectSetup, emptyProjectSetup } from '@/lib/projectSetup';
import { isCeilingCategory, categoryForProject } from '@/lib/serviceLine';

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
  projectName: string;
  onPageChange: (page: number) => void;
  onPinAdded: (pin: DoorPin) => void;
  onPinRemoved: (pinId: string) => void;
  onPinsRemoved: (pinIds: Set<string>) => void;
  onPinUpdated: (pin: DoorPin) => void;
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
  projectName,
  onPageChange,
  onPinAdded,
  onPinRemoved,
  onPinsRemoved,
  onPinUpdated,
  onPinStatusChanged,
  onPinSelected,
  onTotalPagesChange,
  onFloorNameExtracted,
}: FloorPlanViewerProps) {
  const [isDropMode, setIsDropMode] = useState(false);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedPinIds, setSelectedPinIds] = useState<Set<string>>(new Set());

  // Above & Below Ceiling projects are not door inspections: the door-only
  // setup questions (construction/gap/sprinklered) and wall-color calibration
  // don't apply, so we skip both gates for them and let pins drop immediately.
  const isCeiling = isCeilingCategory(categoryForProject(projectName));

  // ── Wall-color calibration (assembly-type auto-detect) ──────────────────────
  // Required once per project before pins can be dropped: the inspector taps a
  // line for each assembly type (or marks it N/A). See lib/wallDetect.ts.
  const [calibration, setCalibration] = useState<ProjectCalibration>(emptyCalibration);
  const [showCalibration, setShowCalibration] = useState(false);
  const [armedType, setArmedType] = useState<string | null>(null);
  const [lastPickFailed, setLastPickFailed] = useState(false);

  // Load (or reload) calibration when the project changes.
  useEffect(() => {
    const c = loadCalibration(projectName);
    setCalibration(c);
    setShowCalibration(!isCeiling && !c.calibrated);
    setArmedType(null);
    setLastPickFailed(false);
  }, [projectName]);

  const persistCalibration = (c: ProjectCalibration) => {
    setCalibration(c);
    saveCalibration(projectName, c);
  };
  const handleWallColorPicked = (pick: WallPick | null) => {
    if (!armedType) return;
    if (!pick) { setLastPickFailed(true); return; }
    setLastPickFailed(false);
    // 'unknown' style (couldn't read gaps) defaults to solid — most lines are.
    const style = pick.style === 'unknown' ? 'solid' : pick.style;
    persistCalibration({
      ...calibration,
      types: { ...calibration.types, [armedType]: { rgb: pick.rgb, width: 0, style } },
    });
    setArmedType(null);
  };
  const handleSetNA = (type: string) => {
    persistCalibration({ ...calibration, types: { ...calibration.types, [type]: 'na' } });
    if (armedType === type) setArmedType(null);
  };
  const handleClearType = (type: string) => {
    const types = { ...calibration.types };
    delete types[type];
    // Clearing an entry re-opens calibration (it's no longer complete).
    persistCalibration({ ...calibration, types, calibrated: false });
  };
  const handleFinishCalibration = () => {
    persistCalibration({ ...calibration, calibrated: true });
    setShowCalibration(false);
    setArmedType(null);
  };
  // Calibrate mode intercepts a plan tap only while a type is armed.
  const isCalibrateMode = showCalibration && armedType !== null;

  // ── Per-project setup gate (construction, gap standard, sprinklered, assisted) ──
  // Required once per project, before calibration and pins.
  const [setup, setSetup] = useState<ProjectSetup>(emptyProjectSetup);
  const [showSetup, setShowSetup] = useState(false);
  useEffect(() => {
    const s = loadProjectSetup(projectName);
    setSetup(s);
    setShowSetup(!isCeiling && !s.configured);
  }, [projectName]);
  const handleSaveSetup = (s: ProjectSetup) => {
    saveProjectSetup(projectName, s);
    setSetup(s);
    setShowSetup(false);
  };
  // Ceiling projects have no door setup/calibration to satisfy, so pins can drop
  // as soon as the plan is open.
  const canDropPins = isCeiling || (setup.configured && calibration.calibrated);

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
    onPinSelected(updatedPin);
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
        onPinUpdated={onPinUpdated}
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
        isCalibrateMode={isCalibrateMode}
        calibration={calibration}
        onWallColorPicked={handleWallColorPicked}
      />

      {/* Fieldwire-style Markup Toolbar - Bottom Right */}
      <div className="fixed bottom-4 right-4 z-40 flex flex-col gap-2">
        {/* Project setup + wall calibration are door-only; hidden for ceiling. */}
        {!isCeiling && (
          <>
            {/* Project setup — required before dropping pins */}
            <button
              onClick={() => { setShowSetup(true); setIsDropMode(false); setIsSelectMode(false); }}
              className={`p-3 rounded-lg shadow-lg transition-all ${
                setup.configured ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-amber-500 text-white hover:bg-amber-600 animate-pulse'
              }`}
              title="Project setup"
            >
              <SlidersHorizontal size={20} />
            </button>

            {/* Calibrate wall colors — required before dropping pins */}
            <button
              onClick={() => { setShowCalibration(true); setIsDropMode(false); setIsSelectMode(false); }}
              className={`p-3 rounded-lg shadow-lg transition-all ${
                showCalibration
                  ? 'bg-amber-500 text-white hover:bg-amber-600'
                  : calibration.calibrated
                    ? 'bg-gray-700 text-white hover:bg-gray-600'
                    : 'bg-amber-500 text-white hover:bg-amber-600 animate-pulse'
              }`}
              title="Set up wall colors"
            >
              <Palette size={20} />
            </button>
          </>
        )}

        {/* Pin Tool — for doors, disabled until project setup + wall calibration
            are done; for ceiling it's always available. */}
        <button
          onClick={() => {
            if (!isCeiling && !setup.configured) { setShowSetup(true); return; }
            if (!isCeiling && !calibration.calibrated) { setShowCalibration(true); return; }
            setIsDropMode(!isDropMode);
            if (isSelectMode) setIsSelectMode(false);
          }}
          disabled={!canDropPins}
          className={`p-3 rounded-lg shadow-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
            isDropMode
              ? 'bg-blue-500 text-white hover:bg-blue-600'
              : 'bg-gray-700 text-white hover:bg-gray-600'
          }`}
          title={
            !isCeiling && !setup.configured ? 'Finish project setup first'
              : !isCeiling && !calibration.calibrated ? 'Calibrate wall colors first'
                : isDropMode ? 'Exit drop mode' : 'Drop pins'
          }
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
              }
            }}
            className="p-3 rounded-lg shadow-lg bg-red-600 text-white hover:bg-red-700 transition-all"
            title={`Delete ${selectedPinIds.size} selected pin(s)`}
          >
            <Trash size={20} /> <span className="ml-1 text-xs font-semibold">({selectedPinIds.size})</span>
          </button>
        )}

      </div>

      {/* Project setup (required, shown before calibration) */}
      {showSetup && (
        <ProjectSetupPanel
          initial={setup}
          onSave={handleSaveSetup}
          onCancel={setup.configured ? () => setShowSetup(false) : undefined}
        />
      )}

      {/* Wall-color calibration panel (required before first pin) */}
      {showCalibration && !showSetup && (
        <WallCalibration
          calibration={calibration}
          armedType={armedType}
          lastPickFailed={lastPickFailed}
          onArm={(t) => { setArmedType(t); setLastPickFailed(false); }}
          onSetNA={handleSetNA}
          onClear={handleClearType}
          onFinish={handleFinishCalibration}
          onCancel={calibration.calibrated ? () => { setShowCalibration(false); setArmedType(null); } : undefined}
        />
      )}
    </div>
  );
}
