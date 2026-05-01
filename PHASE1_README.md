# CODIFY Door Inspection — Phase 1

## What's Included in Phase 1

This is the foundation of the CODIFY door inspection system. Phase 1 focuses on the **interactive PDF floor plan viewer with pin-dropping**, which is the core workflow for mapping doors to inspection tasks.

### Features

#### 1. **Setup Wizard**
- Inspector name entry
- Project/facility name selection
- Optional Supabase cloud sync configuration
- Progress tracking through setup steps

#### 2. **Floor Plan Viewer (Main Feature)**
- **PDF Upload**: Upload life safety drawings (PDFs) from your computer
- **Pin Dropping**: Click "Start Dropping Pins" to enter drop mode, then click on the PDF to place pins
- **Pin Management**: 
  - Edit icon number (door identifier)
  - Set asset ID (optional, for linking to Fieldwire data)
  - Assign status: Not Inspected, Pass, Fail, Repair Scope
  - Delete pins
- **Visual Feedback**: Pins are color-coded by status:
  - 🟠 Amber: Not inspected (default)
  - 🟢 Green: Pass
  - 🔴 Red: Fail
  - 🟡 Yellow: Repair Scope
- **PDF Controls**: 
  - Page navigation (Previous/Next)
  - Zoom in/out
  - Responsive canvas rendering
- **Persistent Storage**: All pins are saved to browser localStorage

#### 3. **Navigation & Layout**
- **Sidebar**: Quick access to Floor Plan, Inspection, Records, and Config tabs
- **Header**: Shows inspector name, project name, and sync status (Online/Offline)
- **Dark Industrial Design**: CODIFY's signature aesthetic with amber accents

#### 4. **Design System**
- **Color Palette**: Dark near-black backgrounds (#0d0f12), amber accent (#e8a020), semantic colors (green/red/yellow)
- **Typography**: Barlow Condensed for headings, Barlow for body, Share Tech Mono for data
- **Components**: Reusable button styles, card layouts, input fields

---

## How to Use Phase 1

### First Time Setup
1. Open the app — you'll see the setup wizard
2. Enter your inspector name
3. Select your project/facility name
4. (Optional) Add Supabase credentials for cloud sync
5. Click "Start Inspecting"

### Using the Floor Plan Viewer
1. Click the upload area to select a PDF floor plan
2. Click "Start Dropping Pins" to enter drop mode
3. Click on the PDF where each door is located
4. For each pin:
   - Enter the icon/door number
   - (Optional) Add the asset ID
   - Set the status (Not Inspected, Pass, Fail, Repair Scope)
5. Pins are automatically saved to your browser

### Navigation
- Use the sidebar to switch between tabs
- The header shows your current project and sync status
- All data is stored locally in browser storage

---

## Architecture & File Structure

```
client/src/
├── App.tsx                    # Main app component with routing
├── index.css                  # Design tokens and CODIFY theme
├── types.ts                   # TypeScript interfaces
├── components/
│   ├── Header.tsx            # Top navigation bar
│   ├── Sidebar.tsx           # Left sidebar navigation
│   ├── PDFViewer.tsx         # PDF canvas + pin rendering
│   └── ErrorBoundary.tsx     # Error handling
├── hooks/
│   └── useLocalStorage.ts    # Browser storage hook
├── lib/
│   └── supabase.ts           # Supabase client (prepared for Phase 2)
├── pages/
│   ├── Setup.tsx             # Onboarding wizard
│   ├── FloorPlanViewer.tsx   # Main floor plan page
│   ├── InspectionWizard.tsx  # Placeholder (Phase 2)
│   ├── RecordsTab.tsx        # Placeholder (Phase 2)
│   └── ConfigTab.tsx         # Placeholder (Phase 2)
└── contexts/
    └── ThemeContext.tsx      # Dark theme provider
```

---

## Data Storage

### LocalStorage Keys
- `inspectorName` — Inspector's name
- `activeProject` — Current project name
- `floorPlanPins` — Array of door pins on the floor plan
- `supabaseUrl` — Supabase project URL (optional)
- `supabaseKey` — Supabase anon key (optional)
- `syncStatus` — Online/Offline status

### Pin Data Structure
```typescript
interface DoorPin {
  id: string;              // Unique identifier (UUID)
  x: number;               // X position on PDF (0-100%)
  y: number;               // Y position on PDF (0-100%)
  iconNo: string;          // Door/icon number
  assetId: string | null;  // Optional asset ID from Fieldwire
  status: DoorStatus;      // not_inspected | pass | fail | repair_scope
  projectName: string;     // Project this pin belongs to
}
```

---

## What's NOT in Phase 1 (Coming in Phase 2-3)

- ❌ 10-section inspection wizard with branch logic
- ❌ Photo attachments per door
- ❌ Records dashboard with search/filter
- ❌ Supabase cloud sync (infrastructure ready, not integrated)
- ❌ Fieldwire CSV import
- ❌ Post-inspection status tracking
- ❌ Multi-inspector collaboration features

---

## Next Steps (Phase 2)

When you're ready, Phase 2 will add:
1. **Inspection Wizard** — The 10-section checklist from your original app
2. **Photo Attachments** — Upload photos per door to Supabase Storage
3. **Records Tab** — View completed inspections with search/filter
4. **Post-Inspection Status** — Track door status after inspection

---

## Technical Notes

### Dependencies
- **React 19** — UI framework
- **Tailwind CSS 4** — Styling
- **pdfjs-dist** — PDF rendering
- **uuid** — Pin ID generation
- **Wouter** — Routing (prepared for future use)

### Browser Compatibility
- Modern browsers (Chrome, Firefox, Safari, Edge)
- Requires localStorage support
- PDF.js worker script loaded from CDN

### Performance
- PDF pages render on-demand
- Pins are drawn on canvas for performance
- Zoom/pan operations are smooth
- No backend required for Phase 1

---

## Troubleshooting

### PDF won't load
- Ensure the file is a valid PDF
- Check browser console for errors
- Try a different PDF file

### Pins not saving
- Check browser localStorage is enabled
- Open DevTools → Application → LocalStorage
- Look for `floorPlanPins` key

### Sync status shows "Offline"
- Check your internet connection
- Supabase credentials are optional in Phase 1

---

## Questions or Issues?

This is Phase 1 of a multi-phase project. As you test with your team, please note:
- This is a foundation for future features
- Data is stored locally; no cloud backup yet (optional Supabase coming in Phase 2)
- The inspection wizard and records features are coming next

Feedback on the PDF viewer and pin system will help shape Phase 2!
