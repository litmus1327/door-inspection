import { useMemo } from 'react';
import {
  CEILING_FINDINGS,
  CeilingZone,
  CeilingCategory,
  CeilingFinding,
} from '@/lib/ceilingFindings';

// "Training wheels" tour for new inspectors — the where-to-look aid that mirrors
// Scott Fox's building walkthrough. Groups the finding catalog by zone
// (Inside / Outside / Roof) and category so an inspector can work an area
// systematically. Tapping a finding deep-links it into the wizard's picker.
// This is navigational only; it never records anything on its own.

const ZONE_ORDER: CeilingZone[] = ['Inside', 'Outside', 'Roof'];
const ZONE_BLURB: Record<CeilingZone, string> = {
  Inside: 'Above/below ceiling and room-by-room: barriers, systems, utilities, egress, med gas.',
  Outside: 'Emergency generator, fuel, transfer switch, and utility mains.',
  Roof: 'Rooftop equipment, exhaust, lightning protection, bulk gases.',
};

interface Props {
  onPick: (findingId: string) => void;
}

export default function CeilingWalkthrough({ onPick }: Props) {
  // zone -> category -> findings
  const byZone = useMemo(() => {
    const zones = new Map<CeilingZone, Map<CeilingCategory, CeilingFinding[]>>();
    for (const f of CEILING_FINDINGS) {
      const cats = zones.get(f.zone) || new Map<CeilingCategory, CeilingFinding[]>();
      const arr = cats.get(f.category) || [];
      arr.push(f);
      cats.set(f.category, arr);
      zones.set(f.zone, cats);
    }
    return zones;
  }, []);

  return (
    <div className="rounded-md border border-border bg-card p-3 space-y-3">
      {ZONE_ORDER.filter((z) => byZone.has(z)).map((zone) => (
        <div key={zone}>
          <p className="text-sm font-semibold">{zone}</p>
          <p className="text-xs text-muted-foreground mb-1.5">{ZONE_BLURB[zone]}</p>
          <div className="space-y-2">
            {Array.from(byZone.get(zone)!.entries()).map(([cat, items]) => (
              <div key={cat}>
                <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">{cat}</p>
                <div className="flex flex-wrap gap-1">
                  {items.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => onPick(f.id)}
                      title={f.whatToLookFor}
                      className="text-[11px] px-2 py-0.5 rounded-sm border border-border text-muted-foreground hover:border-primary hover:text-primary transition-all"
                    >
                      {f.detail.replace(/\.$/, '')}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
