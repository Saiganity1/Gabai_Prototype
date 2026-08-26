export const AREA_STATUS = { label: 'Low Risk', color: 'green' as const }

export const ROUTE_OPTIONS = [
  { id: 'safe', label: 'Safest', time: '18 min', detail: 'Avoids 3 flood zones', risk: 'low' },
  { id: 'balanced', label: 'Balanced', time: '16 min', detail: 'Moderate risk area', risk: 'medium' },
  { id: 'fast', label: 'Fastest', time: '14 min', detail: 'Passes 1 high-risk zone', risk: 'high' },
]

export const REPORT_TYPES = [
  { id: 'flood', emoji: '🌊', label: 'Flood' },
  { id: 'road', emoji: '🚧', label: 'Road Blocked' },
  { id: 'fire', emoji: '🔥', label: 'Fire' },
  { id: 'power', emoji: '⚡', label: 'Power Outage' },
  { id: 'person', emoji: '🧍', label: 'Person in Danger' },
  { id: 'other', emoji: '⚠️', label: 'Other' },
]

export const EVAC_CENTERS = [
  { name: 'Rizal Elementary School', dist: '0.6 km', cap: '85%', status: 'Open' },
  { name: 'Barangay Hall — Sta. Cruz', dist: '1.1 km', cap: '62%', status: 'Open' },
  { name: 'Luneta Recreation Center', dist: '2.3 km', cap: '40%', status: 'Open' },
]

export const SUGGESTIONS = ["Is it safe to go home?", "Find me a safer route.", "What's happening around me?"]
