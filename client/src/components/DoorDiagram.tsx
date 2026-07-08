import { useState } from 'react';
import { Zone } from '@/types';
import {
  ZONE_LABELS,
  ZONE_TO_ITEM_IDS,
  SINGLE_LEAF_ZONES,
} from '@/lib/doorZones';

/**
 * Phase 1 interactive door diagram: a static single-leaf elevation with
 * clickable zones and hover labels. Presentational only — no inspection
 * logic. Click fires onZoneClick (and logs to the console); color state and
 * wizard wiring come in later phases.
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

// Industrial Blueprint palette (static in Phase 1).
const C = {
  bg: '#0d0f12',
  frame: '#232840',
  base: '#1c2030',
  hover: '#2c3350',
  stroke: '#4a5570',
  amber: '#e8a020',
  textPrimary: '#dce3f0',
  textMuted: '#8892aa',
};

const ON_DOOR: Zone[] = [
  'frame',
  'head_gap',
  'sill_gap',
  'hinge_stile',
  'latch_stile',
  'leaf_face',
  'vision_panel',
  'closer',
  'latch_hw',
];
const CHIP_ZONES: Zone[] = ['panic_hw', 'gasketing', 'signage'];

export default function DoorDiagram({
  zones = SINGLE_LEAF_ZONES,
  getZoneColor,
  onZoneClick,
  onZoneHover,
}: DoorDiagramProps) {
  const [hover, setHover] = useState<Zone | null>(null);

  const enabled = (z: Zone) => zones.includes(z);
  const onDoor = ON_DOOR.filter(enabled);
  const chips = CHIP_ZONES.filter(enabled);

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
          color: hover ? C.amber : C.textMuted,
          fontFamily: 'monospace',
          fontSize: 13,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          marginBottom: 12,
          minHeight: 18,
        }}
      >
        {caption}
      </div>

      <svg
        viewBox="0 0 420 600"
        width="100%"
        style={{ maxWidth: 360, display: 'block', margin: '0 auto' }}
        role="img"
        aria-label="Single-leaf door diagram"
      >
        {/* Frame band (clickable border area) */}
        {enabled('frame') && (
          <rect
            {...handlers('frame')}
            x={40}
            y={20}
            width={340}
            height={520}
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

        {/* Hinge stile (left edge) */}
        {enabled('hinge_stile') && (
          <g {...handlers('hinge_stile')}>
            <rect
              x={64}
              y={56}
              width={20}
              height={448}
              fill={fillFor('hinge_stile', C.base)}
              stroke={strokeFor('hinge_stile')}
              strokeWidth={1}
            />
            {[120, 280, 440].map((cy) => (
              <rect
                key={cy}
                x={68}
                y={cy}
                width={12}
                height={26}
                fill={C.stroke}
                pointerEvents="none"
              />
            ))}
          </g>
        )}

        {/* Latch stile (right edge) */}
        {enabled('latch_stile') && (
          <rect
            {...handlers('latch_stile')}
            x={336}
            y={56}
            width={20}
            height={448}
            fill={fillFor('latch_stile', C.base)}
            stroke={strokeFor('latch_stile')}
            strokeWidth={1}
          />
        )}

        {/* Vision panel */}
        {enabled('vision_panel') && (
          <rect
            {...handlers('vision_panel')}
            x={150}
            y={90}
            width={120}
            height={104}
            rx={2}
            fill={fillFor('vision_panel', '#151a24')}
            stroke={strokeFor('vision_panel')}
            strokeWidth={1.5}
          />
        )}

        {/* Closer (top hinge side) */}
        {enabled('closer') && (
          <g {...handlers('closer')}>
            <rect
              x={92}
              y={66}
              width={54}
              height={20}
              rx={2}
              fill={fillFor('closer', C.frame)}
              stroke={strokeFor('closer')}
              strokeWidth={1}
            />
            <line
              x1={146}
              y1={76}
              x2={176}
              y2={82}
              stroke={strokeFor('closer')}
              strokeWidth={2}
              pointerEvents="none"
            />
          </g>
        )}

        {/* Latch / lockset hardware (mid latch edge) */}
        {enabled('latch_hw') && (
          <g {...handlers('latch_hw')}>
            <rect
              x={322}
              y={266}
              width={22}
              height={34}
              rx={3}
              fill={fillFor('latch_hw', C.frame)}
              stroke={strokeFor('latch_hw')}
              strokeWidth={1}
            />
            <circle cx={333} cy={283} r={5} fill={C.stroke} pointerEvents="none" />
          </g>
        )}

        {/* Chips for parts without a distinct spot on a single-leaf elevation */}
        {chips.map((z, i) => {
          const cw = 116;
          const gap = 10;
          const totalW = chips.length * cw + (chips.length - 1) * gap;
          const startX = 210 - totalW / 2;
          const x = startX + i * (cw + gap);
          const y = 552;
          const active = hover === z;
          return (
            <g key={z} {...handlers(z)}>
              <rect
                x={x}
                y={y}
                width={cw}
                height={30}
                rx={15}
                fill={fillFor(z, C.base)}
                stroke={active ? C.amber : C.stroke}
                strokeWidth={1}
              />
              <text
                x={x + cw / 2}
                y={y + 20}
                textAnchor="middle"
                fontSize={12}
                fontFamily="monospace"
                fill={active ? C.amber : C.textPrimary}
                pointerEvents="none"
              >
                {ZONE_LABELS[z]}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
