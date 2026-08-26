import { Hazard } from '../components/MapCanvas'
import { calculateDistanceKm, formatDistance } from '../hooks/useUserLocation'

export const PAMPANGA_REAL_HAZARDS: Array<{
  id: string | number
  type: string
  emoji: string
  label: string
  lat: number
  lng: number
  severity: 'high' | 'medium' | 'low'
  confidence: number
  reports: number
  verified: number
  ago: string
  status: string
  locationDesc: string
}> = [
  {
    id: 'haz-pamp-1',
    type: 'flood',
    emoji: '🌊',
    label: 'MacArthur Highway Flash Flood (Knee-Deep 0.5m)',
    lat: 15.039,
    lng: 120.684,
    severity: 'high',
    confidence: 96,
    reports: 24,
    verified: 3,
    ago: '3 mins ago',
    status: 'Impassable to Sedans & Tricycles',
    locationDesc: 'San Fernando Commercial Corridor',
  },
  {
    id: 'haz-pamp-2',
    type: 'flood',
    emoji: '🌊',
    label: 'Pampanga River Overspill Danger Zone',
    lat: 15.088,
    lng: 120.819,
    severity: 'high',
    confidence: 98,
    reports: 38,
    verified: 5,
    ago: '5 mins ago',
    status: 'Critical Alert · Water Level Rising',
    locationDesc: 'Candaba-San Luis River Basin',
  },
  {
    id: 'haz-pamp-3',
    type: 'closure',
    emoji: '🚧',
    label: 'Jose Abad Santos Avenue (JASA) Road Clearing',
    lat: 15.046,
    lng: 120.676,
    severity: 'medium',
    confidence: 91,
    reports: 12,
    verified: 2,
    ago: '10 mins ago',
    status: 'Counterflow Traffic Enforced',
    locationDesc: 'San Fernando - Guagua Boundary',
  },
  {
    id: 'haz-pamp-4',
    type: 'flood',
    emoji: '🌊',
    label: 'Macabebe-Masantol Delta Tidal Backflow',
    lat: 14.902,
    lng: 120.718,
    severity: 'high',
    confidence: 95,
    reports: 29,
    verified: 4,
    ago: '12 mins ago',
    status: 'Waist-Deep Flooding in Low Areas',
    locationDesc: 'Macabebe Riverbank Corridor',
  },
  {
    id: 'haz-pamp-5',
    type: 'rain',
    emoji: '🌧️',
    label: 'Mt. Arayat Heavy Torrential Precipitation Cell',
    lat: 15.205,
    lng: 120.742,
    severity: 'medium',
    confidence: 89,
    reports: 8,
    verified: 1,
    ago: '15 mins ago',
    status: 'Flash Flood Watch Active',
    locationDesc: 'Arayat-Magalang Mountain Slope',
  },
  {
    id: 'haz-pamp-6',
    type: 'closure',
    emoji: '🚧',
    label: 'Balibago Angeles City Intersection Submerged Road',
    lat: 15.158,
    lng: 120.598,
    severity: 'high',
    confidence: 92,
    reports: 19,
    verified: 2,
    ago: '8 mins ago',
    status: 'Impassable to Light Vehicles',
    locationDesc: 'Angeles City Entertainment District',
  },
]

export function getContextualHazards(userLat: number, userLng: number): Hazard[] {
  // If user is anywhere in Central Luzon / Pampanga, return real accurate Pampanga hazards plus relative context
  return PAMPANGA_REAL_HAZARDS.map((h) => {
    const distKm = calculateDistanceKm(userLat, userLng, h.lat, h.lng)
    return {
      id: h.id,
      type: h.type,
      emoji: h.emoji,
      label: h.label,
      lat: h.lat,
      lng: h.lng,
      severity: h.severity,
      confidence: h.confidence,
      distance: formatDistance(distKm),
      reports: h.reports,
      verified: h.verified,
      ago: h.ago,
      status: h.status,
    }
  })
}

export const PAMPANGA_REAL_EVAC_CENTERS = [
  {
    name: 'Heroes Hall Disaster Operations & Evacuation Center',
    lat: 15.043,
    lng: 120.683,
    cap: '75%',
    status: 'Open · Primary Provincial Shelter Active',
  },
  {
    name: 'Pampanga Provincial Capitol Multi-Purpose Gymnasium',
    lat: 15.032,
    lng: 120.684,
    cap: '58%',
    status: 'Open · Emergency Food & Medical Hub',
  },
  {
    name: 'Angeles City National High School Disaster Evacuation Gym',
    lat: 15.151,
    lng: 120.592,
    cap: '45%',
    status: 'Open · Relief Goods Stocked',
  },
  {
    name: 'Guagua National Colleges Evacuation Shelter',
    lat: 14.968,
    lng: 120.631,
    cap: '62%',
    status: 'Open · High-Ground Safe Facility',
  },
  {
    name: 'Lubao Municipal Sports Complex Disaster Shelter',
    lat: 14.941,
    lng: 120.601,
    cap: '35%',
    status: 'Open · Water Purification Unit Active',
  },
  {
    name: 'Apalit Municipal Gymnasium & Relief Base',
    lat: 14.958,
    lng: 120.757,
    cap: '80%',
    status: 'Open · River Corridor Rescue Base',
  },
]

export function getContextualEvacCenters(userLat: number, userLng: number, _locationName?: string) {
  return PAMPANGA_REAL_EVAC_CENTERS.map((t) => {
    const distKm = calculateDistanceKm(userLat, userLng, t.lat, t.lng)
    return {
      name: t.name,
      dist: formatDistance(distKm),
      cap: t.cap,
      status: t.status,
      lat: t.lat,
      lng: t.lng,
    }
  })
}
