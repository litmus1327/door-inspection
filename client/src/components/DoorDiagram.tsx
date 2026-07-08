import { useState } from 'react';
import { Zone } from '@/types';
import {
  ZONE_LABELS,
  ZONE_TO_ITEM_IDS,
  SINGLE_LEAF_ZONES,
} from '@/lib/doorZones';

/**
 * Interactive single-leaf door diagram. Clickable zones with hover labels;
 * click fires onZoneClick (and logs to the console). Presentational only —
 * no inspection logic. Color state and wizard wiring come in later phases.
 *
 * A local panic-device toggle (off by default) swaps the lever lockset for a
 * push bar and exposes the panic zone. In a later phase this binds to the
 * door's hardware state instead of a local toggle.
 *
 * See INTERACTIVE_DOOR_DIAGRAM_SPEC.md.
 */
export interface DoorDiagramProps {
  /** Which zones to render. Defaults to the single-leaf set. */
  zones?: Zone[];
  /** Phase 2 hook: return a fill color for a zone based on its state. */
  getZoneColor?: (zone: Zone) => string | undefined;
  onZoneClick?: (zone: Zone) => void;
  onZoneHover?: (zone: Zone | null) => void;
}

// Industrial Blueprint palette (static in this phase).
const C = {
  bg: '#0d0f12',
  frame: '#2b3350',
  base: '#1c2030',
  hover: '#2c3350',
  stroke: '#4a5570',
  metal: '#6b7590',
  glass: '#10131a',
  amber: '#e8a020',
  textPrimary: '#dce3f0',
  textMuted: '#8892aa',
};

export default function DoorDiagram({
  zones = SINGLE_LEAF_ZONES,
  getZoneColor,
  onZoneClick,
  onZoneHover,
}: DoorDiagramProps) {
  const [hover, setHover] = useState<Zone | null>(null);
  const [panicOn, setPanicOn] = useState(false);

  const enabled = (z: Zone) =>
    zones.includes(z) &&
    (z === 'panic_hw' ? panicOn : z === 'latch_hw' ? !panicOn : true);

  function fillFor(z: Zone, fallback: string) {
    const stateColor = getZoneColor?.(z);
    if (stateColor) return stateColor;
    return hover === z ? C.hover : fallback;
  }
  const strokeFor = (z: Zone) => (hover === z ? C.amber : C.stroke);

  function handlers(z: Zone) {
    return {
      'data-zone': z,
      style: { cursor: 'pointer' } as const,
      onMouseEnter: () => {
        setHover(z);
        onZoneHover?.(z);
      },
      onMouseLeave: () => {
        setHover(null);
        onZoneHover?.(null);
      },
      onClick: () => {
        // eslint-disable-next-line no-console
        console.log('[DoorDiagram] zone click:', z, ZONE_TO_ITEM_IDS[z]);
        onZoneClick?.(z);
      },
    };
  }

  const caption = hover
    ? `${ZONE_LABELS[hover]} — ${ZONE_TO_ITEM_IDS[hover].length} item(s)`
    : 'Hover or tap a part of the door';

  return (
    <div style={{ background: C.bg, padding: 16, borderRadius: 8 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
          gap: 12,
        }}
      >
        <div
          style={{
            color: hover ? C.amber : C.textMuted,
            fontFamily: 'monospace',
            fontSize: 13,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            minHeight: 18,
          }}
        >
          {caption}
        </div>
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            color: C.textMuted,
            fontFamily: 'monospace',
            fontSize: 12,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          <input
            type="checkbox"
            checked={panicOn}
            onChange={(e) => {
              setPanicOn(e.target.checked);
              if (hover === 'panic_hw' || hover === 'latch_hw') setHover(null);
            }}
          />
          Panic device
        </label>
      </div>

      <svg
        viewBox="0 0 420 600"
        width="100%"
        style={{ maxWidth: 360, display: 'block', margin: '0 auto' }}
        role="img"
        aria-label="Single-leaf door diagram"
      >
        {/* Frame band */}
        {enabled('frame') && (
          <rect
            {...handlers('frame')}
            x={40}
            y={34}
            width={340}
            height={506}
            rx={3}
            fill={fillFor('frame', C.frame)}
            stroke={strokeFor('frame')}
            strokeWidth={2}
          />
        )}

        {/* Leaf face */}
        {enabled('leaf_face') && (
          <rect
            {...handlers('leaf_face')}
            x={84}
            y={56}
            width={252}
            height={448}
            fill={fillFor('leaf_face', C.base)}
            stroke={strokeFor('leaf_face')}
            strokeWidth={1.5}
          />
        )}

        {/* Head (top) gap */}
        {enabled('head_gap') && (
          <rect
            {...handlers('head_gap')}
            x={64}
            y={44}
            width={292}
            height={12}
            fill={fillFor('head_gap', C.base)}
            stroke={strokeFor('head_gap')}
            strokeWidth={1}
          />
        )}

        {/* Sill (bottom) gap */}
        {enabled('sill_gap') && (
          <rect
            {...handlers('sill_gap')}
            x={64}
            y={504}
            width={292}
            height={12}
            fill={fillFor('sill_gap', C.base)}
            stroke={strokeFor('sill_gap')}
            strokeWidth={1}
          />
        )}

        {/* Hinge stile (left edge) plus three hinges centered on the frame jamb */}
        {enabled('hinge_stile') && (
          <g {...handlers('hinge_stile')}>
            <rect
              x={84}
              y={56}
              width={16}
              height={448}
              fill={fillFor('hinge_stile', C.base)}
              stroke={strokeFor('hinge_stile')}
              strokeWidth={1}
            />
            {[120, 272, 424].map((y) => (
              <rect
                key={y}
                x={54}
                y={y}
                width={16}
                height={40}
                rx={3}
                fill={C.metal}
                stroke={strokeFor('hinge_stile')}
                strokeWidth={0.75}
              />
            ))}
          </g>
        )}

        {/* Latch stile (right edge) */}
        {enabled('latch_stile') && (
          <rect
            {...handlers('latch_stile')}
            x={320}
            y={56}
            width={16}
            height={448}
            fill={fillFor('latch_stile', C.base)}
            stroke={strokeFor('latch_stile')}
            strokeWidth={1}
          />
        )}

        {/* Vision panel: tall narrow lite, offset toward the latch side */}
        {enabled('vision_panel') && (
          <g {...handlers('vision_panel')}>
            <rect
              x={236}
              y={96}
              width={52}
              height={168}
              rx={3}
              fill={fillFor('vision_panel', C.glass)}
              stroke={strokeFor('vision_panel')}
              strokeWidth={2}
            />
            <rect
              x={243}
              y={103}
              width={38}
              height={154}
              rx={2}
              fill="none"
              stroke={C.stroke}
              strokeWidth={0.75}
              pointerEvents="none"
            />
          </g>
        )}

        {/* Closer: body on the door near the hinge side, arm reaching the frame */}
        {enabled('closer') && (
          <g {...handlers('closer')}>
            <rect
              x={104}
              y={70}
              width={62}
              height={16}
              rx={2}
              fill={fillFor('closer', C.metal)}
              stroke={strokeFor('closer')}
              strokeWidth={1}
            />
            <polyline
              points="112,72 140,54 176,58"
              fill="none"
              stroke={C.metal}
              strokeWidth={3}
              strokeLinejoin="round"
              strokeLinecap="round"
              pointerEvents="none"
            />
          </g>
        )}

        {/* Latch hardware — lever lockset (panic off) */}
        {enabled('latch_hw') && (
          <g {...handlers('latch_hw')}>
            <rect
              x={312}
              y={270}
              width={16}
              height={44}
              rx={8}
              fill={fillFor('latch_hw', C.metal)}
              stroke={strokeFor('latch_hw')}
              strokeWidth={1}
            />
            <rect
              x={290}
              y={288}
              width={30}
              height={8}
              rx={4}
              fill={C.metal}
              stroke={strokeFor('latch_hw')}
              strokeWidth={0.75}
              pointerEvents="none"
            />
          </g>
        )}

        {/* Latch hardware — panic push bar (panic on) */}
        {enabled('panic_hw') && (
          <g {...handlers('panic_hw')}>
            <rect
              x={104}
              y={282}
              width={214}
              height={22}
              rx={4}
              fill={fillFor('panic_hw', C.metal)}
              stroke={strokeFor('panic_hw')}
              strokeWidth={1}
            />
            <rect
              x={122}
              y={288}
              width={178}
              height={10}
              rx={2}
              fill={C.base}
              pointerEvents="none"
            />
          </g>
        )}
      </svg>
    </div>
  );
}
