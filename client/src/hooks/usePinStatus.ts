// Push a status change from the Tasks pages back onto the plan.
//
// The Tasks pages could set a door's status in bulk, or delete its record
// outright, and the pin on the plan kept whatever colour it had. Nothing
// reconciled them afterwards, so the two views disagreed permanently: a door
// batch-marked Pass still showed red, and a door whose record was deleted still
// showed its old verdict as though it had been inspected.
//
// Writing through useLocalStorage rather than straight to localStorage is what
// makes this work: that hook now broadcasts to every component watching the same
// key, so App's copy of the pin map updates and the plan repaints without a
// reload.

import { useCallback } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { getSupabaseConfig, upsertPin } from '@/lib/supabase';
import { DoorPin, DoorStatus } from '@/types';

export function usePinStatus() {
  const [, setPins] = useLocalStorage<Record<number, DoorPin[]>>('floorPlanPins', {});

  /** Apply `pinId -> status`. Unknown pins and no-op changes are ignored. */
  return useCallback(
    (updates: Map<string, DoorStatus>) => {
      if (updates.size === 0) return;

      // Read fresh rather than closing over the hook's value: this runs from a
      // click handler, possibly after an await, and the pin map is shared.
      let current: Record<number, DoorPin[]> = {};
      try {
        current = JSON.parse(localStorage.getItem('floorPlanPins') || '{}');
      } catch {
        return;
      }

      const touched: DoorPin[] = [];
      const next: Record<number, DoorPin[]> = {};
      for (const key of Object.keys(current)) {
        const page = Number(key);
        next[page] = (current[page] || []).map((p) => {
          const status = updates.get(p.id);
          if (!status || p.status === status) return p;
          const updated = { ...p, status };
          touched.push(updated);
          return updated;
        });
      }
      if (touched.length === 0) return;

      setPins(next);

      // Best-effort, so other devices see the same plan. Offline this is skipped
      // and the pin syncs on the next reconnect, same as everywhere else.
      const cfg = getSupabaseConfig();
      if (cfg.url && cfg.key && navigator.onLine) {
        for (const p of touched) {
          upsertPin(cfg, p).catch(() => { /* retried by the pin sync */ });
        }
      }
    },
    [setPins],
  );
}
