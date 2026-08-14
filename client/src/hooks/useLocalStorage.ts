import { useState, useRef, useCallback, useEffect } from 'react';

// Every hook instance watching the same key, so they stay in step.
//
// Each call to this hook owns a useState whose initialiser runs ONCE, at mount.
// Six components call it with 'inspectorName' (App, Header, ProjectsPage and the
// three wizards), so changing the inspector on the Projects page updated that
// component and localStorage while App and Header went on serving the value they
// read when they mounted. New pins were stamped `owner: <previous inspector>`,
// and the header showed the old name until a reload.
//
// Same defect as the stale closure this hook already had: one value, several
// sources of truth. Fixed here rather than by threading props, so it holds for
// every key -- floorPlanPins and hiddenPagesByProject have the same exposure.
type Listener = (value: any) => void;
const listeners = new Map<string, Set<Listener>>();

function subscribe(key: string, fn: Listener): () => void {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(fn);
  return () => {
    set!.delete(fn);
    if (set!.size === 0) listeners.delete(key);
  };
}

function broadcast(key: string, value: any, from: Listener | null): void {
  const set = listeners.get(key);
  if (!set) return;
  // Copy first: a listener that unsubscribes while we notify would otherwise
  // mutate the set mid-iteration.
  for (const fn of Array.from(set)) {
    if (fn !== from) fn(value);
  }
}

export function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (!item) return initialValue;
      
      // Try to parse as JSON first
      try {
        let parsed = JSON.parse(item);
        
        // Data migration: if pins is an array, convert to Record<number, DoorPin[]>
        if (key === 'floorPlanPins' && Array.isArray(parsed)) {
          // Old format: DoorPin[]
          // New format: Record<number, DoorPin[]>
          const migratedPins: Record<number, any[]> = {};
          if (parsed.length > 0) {
            migratedPins[1] = parsed; // Put all old pins on page 1
          }
          parsed = migratedPins;
        }
        
        return parsed;
      } catch {
        // If JSON parsing fails, return the raw value
        // This handles plain strings like "online" or "offline"
        return item as T;
      }
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  // The latest value, updated synchronously by setValue rather than waiting for
  // a re-render.
  //
  // `setValue` used to resolve an updater against `storedValue`, which is
  // captured from the render closure and does not change until React re-renders.
  // So N calls in one tick all saw the SAME starting value and the last one won.
  // That is not theoretical: "Clear all pins" does
  // `pinIds.forEach(id => onPinRemoved(id))`, N synchronous calls, and each
  // handler removes one pin from `prev`. The inspection records were purged in
  // the same loop by direct localStorage writes, which DO read fresh each time,
  // so the result was every record deleted and all but one pin still on the
  // plan. "Delete selected" has the same shape.
  //
  // Resolving against a ref fixes the whole class rather than that one caller,
  // and keeps the localStorage write out of a React state updater (which may run
  // twice under StrictMode).
  const latest = useRef(storedValue);
  latest.current = storedValue;

  // This instance's inbox, created once so its identity is stable: `setValue`
  // uses it to exclude itself from its own broadcast. `setStoredValue` is
  // referentially stable across renders, so the closure never goes stale.
  const inbox = useRef<Listener | null>(null);
  if (inbox.current === null) {
    inbox.current = (value: any) => {
      latest.current = value;
      setStoredValue(value);
    };
  }

  useEffect(() => subscribe(key, inbox.current!), [key]);

  const setValue = useCallback((value: T | ((val: T) => T)) => {
    try {
      const valueToStore =
        value instanceof Function ? (value as (val: T) => T)(latest.current) : value;
      latest.current = valueToStore;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
      // Tell the other components watching this key. Without this they keep
      // serving whatever they read at mount.
      broadcast(key, valueToStore, inbox.current);
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error);
    }
  }, [key]);

  return [storedValue, setValue] as const;
}
