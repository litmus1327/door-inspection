// Fire & Smoke Damper inspection reference data.
//
// A damper inspection records a Category (Fire / Smoke / Combination), a Status
// (Pass / Fail / Inaccessible), and — on a Fail — one or more flat-sentence
// deficiencies from DAMPER_DEFICIENCIES below. Two independent flags mirror the
// Fieldwire export's dedicated columns: "No Damper Present" and "Inaccessible".
// The deficiency wording matches what the Reporting Tool's pipelines/dampers.py
// parses (flat sentences, no "Category:" prefix). Confirmed with Derek 2026-07-24.

export type DamperCategory = 'Fire' | 'Smoke' | 'Combination';
export type DamperStatus = 'pass' | 'fail' | 'inaccessible';

export const DAMPER_CATEGORIES: DamperCategory[] = ['Fire', 'Smoke', 'Combination'];

// The full deficiency pick-list for a failing damper.
export const DAMPER_DEFICIENCIES: string[] = [
  'Access point not properly identified.',
  'Excessive air leak around damper access.',
  'Damper access not provided.',
  'Damper does not fully close.',
  'Damper fails to close upon activation.',
  'Damper fails to reopen.',
  'Damper is damaged or missing parts.',
  'Damper is inaccessible.',
  'Damper is non-responsive (closed position).',
  'Damper is non-responsive (open position).',
  'Damper is not properly secured to wall.',
  'Damper vane(s) is not securely fastened to axle.',
  'Dampered ductwork has been sealed with firestop.',
  'Fusible link assembly has been modified.',
  'Fusible link is not appropriately rated.',
  'Fusible link is painted.',
  'Obstructions present that prevents damper from closing.',
  'Pneumatic damper is not supplied with control air.',
  'Retaining angle(s) missing.',
];

// Reporting Tool Category strings (pipelines/dampers.py uses Fire / Smoke /
// Combination verbatim) — our app category already matches, so this is identity.
export const DAMPER_STATUS_LABEL: Record<DamperStatus, string> = {
  pass: 'Pass',
  fail: 'Fail',
  inaccessible: 'Inaccessible',
};
