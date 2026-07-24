import { describe, it, expect } from 'vitest';
import {
  CEILING_FINDINGS,
  CEILING_CATEGORIES,
  CEILING_PRIORITIES,
} from './ceilingFindings';

// The Reporting Tool parser (pipelines/above_below_ceiling.py) reads each finding
// from a checklist cell shaped "Yes: <Category>: <Detail> (INI) - YYYY-MM-DD".
// This is the STRICT regex from that parser, ported to JS. If a catalog entry
// can't compose into a string this matches, the report would drop or mangle it —
// this test is the guard against transcription errors (the main risk called out
// in the plan).
const FINDING_PATTERN =
  /^Yes:\s*([A-Za-z][A-Za-z &]*?):\s*(.+?)\s*\(([A-Z]{2,4})\)\s*-\s*(\d{4}-\d{2}-\d{2})\s*$/;

describe('ceiling finding catalog', () => {
  it('has entries', () => {
    expect(CEILING_FINDINGS.length).toBeGreaterThan(50);
  });

  it('every id is unique', () => {
    const ids = CEILING_FINDINGS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every category is one of the canonical 12', () => {
    for (const f of CEILING_FINDINGS) {
      expect(CEILING_CATEGORIES).toContain(f.category);
    }
  });

  it('every default priority is valid', () => {
    for (const f of CEILING_FINDINGS) {
      expect(CEILING_PRIORITIES).toContain(f.defaultPriority);
    }
  });

  it('every detail is non-empty and has SME guidance', () => {
    for (const f of CEILING_FINDINGS) {
      expect(f.detail.trim().length).toBeGreaterThan(0);
      expect(f.whatToLookFor.trim().length).toBeGreaterThan(0);
    }
  });

  it('every finding composes into a string the parser accepts', () => {
    for (const f of CEILING_FINDINGS) {
      const cell = `Yes: ${f.category}: ${f.detail} (SF) - 2026-01-01`;
      const m = FINDING_PATTERN.exec(cell);
      expect(m, `parser rejects: ${f.id} -> ${cell}`).not.toBeNull();
      // The parser uses the row Category column as canonical, but the checklist
      // category prefix must still parse back to the same category so the two agree.
      expect(m![1]).toBe(f.category);
    }
  });

  it('zones are limited to Inside/Outside/Roof', () => {
    for (const f of CEILING_FINDINGS) {
      expect(['Inside', 'Outside', 'Roof']).toContain(f.zone);
    }
  });
});
