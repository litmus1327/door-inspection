import { useState, useEffect } from 'react';

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

  const setValue = (value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error);
    }
  };

  return [storedValue, setValue] as const;
}
