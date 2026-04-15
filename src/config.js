// ── Day names ──
export const ALL_DAY_NAMES = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
];

// ── Default roles ──
export const DEFAULT_ROLES = ['Chef', 'FOH', 'Mix', 'Assembly'];

// ── Default employees ──
export const DEFAULT_EMPLOYEES = [
  { name: 'Nico',  roles: ['Chef', 'Mix', 'FOH', 'Assembly'], active: true },
  { name: 'Sabine', roles: ['Chef',],  active: true },
  { name: 'Joao', roles: ['FOH', 'Assembly', 'Mix'],          active: true },
  { name: 'Girl',  roles: ['FOH'],   active: true },
];

// ── Default day configs ──
const LONG_DAY_RULES = [
  { roles: ['Chef'], count: 1, from: 10, to: 12 },
  { roles: ['Chef', 'Mix', 'Assembly'],         count: 2, from: 12, to: 22 },
  { roles: ['FOH'],         count: 1, from: 10, to: 22 },
  { roles: ['Any'],         count: 2, from: 22, to: 23 },
];

export const DEFAULT_DAYS = [
  {
    name: 'Wednesday', open: 10, close: 18, enabled: true,
    rules: [{ roles: ['Chef'], count: 1, from: 10, to: 18 }],
  },
  ...['Thursday', 'Friday', 'Saturday', 'Sunday'].map(name => ({
    name, open: 10, close: 23, enabled: true,
    rules: LONG_DAY_RULES.map(r => ({ ...r, roles: [...r.roles] })),
  })),
];

// ── Global defaults ──
export const DEFAULT_GLOBALS = {
  maxPerDay: 10,
  weeklyTarget: 40,
};

// ── Visual constants ──
export const ROLE_COLORS = {
  Chef:    { t: '#f0c8a0', a: '#d4956b', b: '#5a3018' },
  FOH:     { t: '#a0f0c8', a: '#5bb88a', b: '#184a2e' },
  Mix:     { t: '#e0b8f0', a: '#a06bc4', b: '#3a1850' },
  Any:     { t: '#a0c8f0', a: '#5b8ab8', b: '#182e4a' },
  Cleaner: { t: '#c8a0f0', a: '#8a5bb8', b: '#30185a' },
  Assembly: { t: '#f0a0c0', a: '#b85b7a', b: '#4a1828' },
  Manager: { t: '#f0e8a0', a: '#b8a05b', b: '#4a4418' },
  KP:      { t: '#a0e8e0', a: '#5bb8b0', b: '#184a44' },
};

export const EMP_COLORS = [
  { bg: '#2d4a3e', text: '#a8e6cf', accent: '#5cb88a' },
  { bg: '#4a3428', text: '#f0c8a0', accent: '#d4956b' },
  { bg: '#3b2e4a', text: '#d4b8e8', accent: '#9b6dc6' },
  { bg: '#283d4a', text: '#a0d4f0', accent: '#5ba3cb' },
  { bg: '#4a2832', text: '#f0a0b8', accent: '#cb5b7a' },
  { bg: '#3a4428', text: '#d4e8a0', accent: '#8ab85b' },
  { bg: '#44382a', text: '#e8d4b0', accent: '#c4a06c' },
  { bg: '#2a3844', text: '#b0d4e8', accent: '#6ca0c4' },
  { bg: '#3e2d4a', text: '#d0a8e6', accent: '#a05cc8' },
  { bg: '#2d4a44', text: '#a8e6dc', accent: '#5cb8a8' },
];

// ── Helpers ──
export const rc = (r) => ROLE_COLORS[r] || ROLE_COLORS.Any;

export function fmt(h) {
  if (h === 0 || h === 24) return '12am';
  if (h === 12) return '12pm';
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}
