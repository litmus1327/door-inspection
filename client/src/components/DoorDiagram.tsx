import { useState } from 'react';
import { Zone, ZoneState } from '@/types';
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
  /** Result state per zone; drives fill/stroke color. Missing = untouched. */
  zoneStates?: Partial<Record<Zone, ZoneState>>;
  /** Show the color legend under the diagram. Default true. */
  showLegend?: boolean;
  /** If provided, controls panic-device presence and hides the local toggle. */
  panicPresent?: boolean;
  onZoneClick?: (zone: Zone) => void;
  onZoneHover?: (zone: Zone | null) => void;
}

// Light palette to match the app's light theme.
const C = {
  bg: '#f7f5f1',
  frame: '#cfc7b6',
  base: '#eae5db',
  hover: '#ded8ca',
  stroke: '#8b8575',
  metal: '#a7a091',
  glass: '#d8e6ef',
  amber: '#a8651a',
  textPrimary: '#1b1d21',
  textMuted: '#6d6a62',
};

// Fill + stroke per result state. untouched falls back to the neutral base.
const STATE_COLORS: Record<ZoneState, { fill: string; stroke: string }> = {
  untouched: { fill: C.base, stroke: C.stroke },
  pass: { fill: '#dff0e6', stroke: '#2f8a55' },
  advisory: { fill: '#f6ead2', stroke: '#b9791a' },
  deficient: { fill: '#f7dcdc', stroke: '#c0271f' },
};

const LEGEND: [ZoneState, string][] = [
  ['untouched', 'Not inspected'],
  ['pass', 'Pass'],
  ['advisory', 'Advisory'],
  ['deficient', 'Deficient'],
];

export default function DoorDiagram({
  zones = SINGLE_LEAF_ZONES,
  zoneStates,
  showLegend = true,
  panicPresent,
  onZoneClick,
  onZoneHover,
}: DoorDiagramProps) {
  const [hover, setHover] = useState<Zone | null>(null);
  const [internalPanic, setInternalPanic] = useState(false);
  const panicOn = panicPresent ?? internalPanic;

  const enabled = (z: Zone) =>
    zones.includes(z) &&
    (z === 'panic_hw' ? panicOn : z === 'latch_hw' ? !panicOn : true);

  function fillFor(z: Zone, fallback: string) {
    const state = zoneStates?.[z];
    if (state && state !== 'untouched') return STATE_COLORS[state].fill;
    return hover === z ? C.hover : fallback;
  }
  function strokeFor(z: Zone) {
    if (hover === z) return C.amber;
    const state = zoneStates?.[z];
    if (state && state !== 'untouched') return STATE_COLORS[state].stroke;
    return C.stroke;
  }

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
        {panicPresent === undefined && (
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
                setInternalPanic(e.target.checked);
                if (hover === 'panic_hw' || hover === 'latch_hw') setHover(null);
              }}
            />
            Panic device
          </label>
        )}
      </div>

      <svg
        viewBox="0 0 420 600"
        width="100%"
        style={{ maxWidth: 360, display: 'block', margin: '0 auto' }}
        role="img"
        aria-label="Single-leaf door diagram"
      >
        {/* Frame: head edges align with the jamb outer edges (x40 and x380) */}
        {enabled('frame') && (
          <rect
            {...handlers('frame')}
            x={40}
            y={26}
            width={340}
            height={514}
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
            x={84}
            y={44}
            width={252}
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
            x={84}
            y={504}
            width={252}
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
            {[102, 256, 410].map((y) => (
              <rect
                key={y}
                x={94}
                y={y}
                width={8}
                height={46}
                rx={2}
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
              points="140,68 109,63 152,56"
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
              x={291}
              y={269}
              width={16}
              height={44}
              rx={8}
              fill={fillFor('latch_hw', C.metal)}
              stroke={strokeFor('latch_hw')}
              strokeWidth={1}
            />
            <rect
              x={269}
              y={287}
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

      {showLegend && (
        <div
          style={{
            display: 'flex',
            gap: 16,
            marginTop: 12,
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}
        >
          {LEGEND.map(([st, label]) => (
            <span
              key={st}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontFamily: 'monospace',
                fontSize: 12,
                color: C.textMuted,
              }}
            >
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 2,
                  background: STATE_COLORS[st].fill,
                  border: `1.5px solid ${STATE_COLORS[st].stroke}`,
                }}
              />
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
