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
  isRoadSegment?: boolean
  roadSegment?: {
    from: { lat: number; lng: number; name?: string }
    to: { lat: number; lng: number; name?: string }
    path?: [number, number][]
    roadName?: string
  }
  passability?: 'all_passable' | 'not_passable_light' | 'not_passable_all'
  waterDepth?: string
  isVerified?: boolean
}> = [
  {
    id: 'haz-pamp-santamaria',
    type: 'flood',
    emoji: '🌊',
    label: 'Santa Maria - Mexico Road Flood Stretch',
    lat: 15.074,
    lng: 120.781,
    severity: 'high',
    confidence: 88,
    reports: 14,
    verified: 0,
    isVerified: false,
    ago: '2 mins ago',
    status: 'Not Passable to Light Vehicles',
    locationDesc: 'Santa Maria - San Luis Road Corridor',
    isRoadSegment: true,
    roadSegment: {
      from: { lat: 15.071, lng: 120.776, name: 'Santa Maria Chapel (Tramo)' },
      to: { lat: 15.078, lng: 120.789, name: 'Purok 2 Highway Crossing' },
      roadName: 'Mexico - San Luis Provincial Road',
      path: [
        [120.7760, 15.0710],
        [120.7774, 15.0719],
        [120.7792, 15.0731],
        [120.7811, 15.0744],
        [120.7830, 15.0756],
        [120.7852, 15.0768],
        [120.7872, 15.0775],
        [120.7890, 15.0780],
      ],
    },
    passability: 'not_passable_light',
    waterDepth: 'Knee Deep (0.45m)',
  },
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
    isVerified: true,
    ago: '3 mins ago',
    status: 'Not Passable to Light Vehicles',
    locationDesc: 'San Fernando Commercial Corridor',
    isRoadSegment: true,
    roadSegment: {
      from: { lat: 15.035, lng: 120.681, name: 'San Fernando Junction' },
      to: { lat: 15.044, lng: 120.688, name: 'Dolores Flyover Intersection' },
      roadName: 'MacArthur Highway',
      path: [
        [120.6810, 15.0350],
        [120.6828, 15.0375],
        [120.6840, 15.0390],
        [120.6860, 15.0415],
        [120.6880, 15.0440],
      ],
    },
    passability: 'not_passable_light',
    waterDepth: 'Knee Deep (0.50m)',
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
    isVerified: true,
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
    isVerified: true,
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
    isVerified: true,
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
    isVerified: true,
    ago: '15 mins ago',
    status: 'Flash Flood Watch Active',
    locationDesc: 'Arayat-Magalang Mountain Slope',
  },
  {
    id: 'haz-pamp-6',
    type: 'flood',
    emoji: '🌊',
    label: 'Balibago Angeles Submerged Road Corridor',
    lat: 15.158,
    lng: 120.598,
    severity: 'high',
    confidence: 92,
    reports: 19,
    verified: 2,
    isVerified: true,
    ago: '8 mins ago',
    status: 'Closed to All Vehicles (Waist Deep)',
    locationDesc: 'Angeles City Entertainment District',
    isRoadSegment: true,
    roadSegment: {
      from: { lat: 15.155, lng: 120.594, name: 'Clark South Perimeter' },
      to: { lat: 15.162, lng: 120.603, name: 'Balibago Crossing' },
      roadName: 'Fields Avenue Corridor',
      path: [
        [120.5940, 15.1550],
        [120.5962, 15.1570],
        [120.5980, 15.1580],
        [120.6010, 15.1605],
        [120.6030, 15.1620],
      ],
    },
    passability: 'not_passable_all',
    waterDepth: 'Chest Deep (1.10m)',
  },
]

export function getContextualHazards(userLat: number, userLng: number): Hazard[] {
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
      isRoadSegment: h.isRoadSegment,
      roadSegment: h.roadSegment,
      passability: h.passability,
      waterDepth: h.waterDepth,
      isVerified: h.isVerified,
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
