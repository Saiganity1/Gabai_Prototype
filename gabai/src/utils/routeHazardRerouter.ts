import { Hazard } from '../components/MapCanvas'
import { CitizenReport } from '../context/DisasterContext'
import { RouteInfo, fetchAccurateRealWorldRoutes, generateDynamicRoutes, routeIntersectsHazards } from './routingEngine'
import { calculateDistanceKm, formatDistance } from '../hooks/useUserLocation'

export interface SafeShelterInfo {
  name: string
  lat: number
  lng: number
  distKm: number
  distanceText: string
  status?: string
}

export interface EmergencyContact {
  name: string
  number: string
  icon: string
  category: string
}

export interface RerouteEvaluationResult {
  success: boolean
  newRoute?: RouteInfo
  oldEtaMinutes: number
  newEtaMinutes?: number
  etaDiffMinutes?: number
  distanceKm?: number
  reason?: string
  nearestShelter?: SafeShelterInfo
  emergencyHotlines: EmergencyContact[]
}

export const DEFAULT_EMERGENCY_HOTLINES: EmergencyContact[] = [
  { name: 'National Emergency Line', number: '911', icon: '🚨', category: 'National Dispatch' },
  { name: 'Pampanga PDRRMO Rescue', number: '(045) 961-2468', icon: '🏢', category: 'Provincial Disaster' },
  { name: 'Red Cross Emergency Ambulance', number: '(045) 961-4682', icon: '🚑', category: 'Medical & Rescue' },
  { name: 'BFP Emergency Fire & Rescue', number: '(045) 961-2244', icon: '🚒', category: 'Fire & Flood Rescue' },
  { name: 'PNP Provincial Police Operations', number: '(045) 961-3434', icon: '🚓', category: 'Law & Safety' },
]

/**
 * Extracts minutes from formatted string e.g. "14 mins" or "1 hr 12 mins"
 */
export function parseEtaMinutes(timeStr?: string): number {
  if (!timeStr) return 10
  const hrMatch = timeStr.match(/(\d+)\s*hr/)
  const minMatch = timeStr.match(/(\d+)\s*min/)
  let total = 0
  if (hrMatch) total += parseInt(hrMatch[1], 10) * 60
  if (minMatch) total += parseInt(minMatch[1], 10)
  if (total === 0) {
    const num = parseInt(timeStr, 10)
    if (!isNaN(num)) total = num
  }
  return total > 0 ? total : 10
}

/**
 * Attempts to calculate an alternative route that strictly avoids the newly reported flood hazard.
 * If no safe alternative route can be discovered, extracts nearest safe shelter and hotlines.
 */
export async function calculateDetourAroundHazard(
  userCoords: { lat: number; lng: number },
  destination: { lat: number; lng: number; name?: string },
  blockingHazard: Hazard | CitizenReport,
  existingHazards: Hazard[],
  currentRoute?: RouteInfo,
  availableShelters?: Array<{ name: string; lat: number; lng: number; status?: string }>
): Promise<RerouteEvaluationResult> {
  const oldEtaMinutes = parseEtaMinutes(currentRoute?.time)

  // 1. Synthesize Hazard Object for Exclusion
  const hazardToAvoid: Hazard = {
    id: (blockingHazard as any).id || `haz-dyn-${Date.now()}`,
    type: (blockingHazard as any).type || 'flood',
    emoji: (blockingHazard as any).emoji || '🌊',
    label: (blockingHazard as any).label || (blockingHazard as any).locationName || 'Road Flooding',
    lat: blockingHazard.lat,
    lng: blockingHazard.lng,
    severity: (blockingHazard as any).severity || 'high',
    confidence: 95,
    distance: 'Ahead',
    reports: (blockingHazard as any).reports || 1,
    verified: 1,
    ago: 'Just now',
    status: 'Verified',
    isRoadSegment: (blockingHazard as any).isRoadSegment,
    roadSegment: (blockingHazard as any).roadSegment,
    passability: (blockingHazard as any).passability || 'not_passable_all',
  }

  // Combine active hazards with high priority on avoiding the blocking one
  const augmentedHazards = [
    hazardToAvoid,
    ...existingHazards.filter((h) => String(h.id) !== String(hazardToAvoid.id)),
  ]

  // 2. Query Multi-Candidate AI / OSRM Routing Engine for Alternative Paths
  let computedRoutes: Record<'safe' | 'balanced' | 'fast', RouteInfo> | null = null

  try {
    computedRoutes = await fetchAccurateRealWorldRoutes(
      userCoords.lat,
      userCoords.lng,
      destination.lat,
      destination.lng,
      augmentedHazards
    )
  } catch (err) {
    console.warn('Real-world OSRM routing error, falling back to algorithmic routing:', err)
  }

  if (!computedRoutes) {
    computedRoutes = generateDynamicRoutes(
      userCoords.lat,
      userCoords.lng,
      destination.lat,
      destination.lng,
      augmentedHazards
    )
  }

  // 3. Evaluate Candidate Routes Against the Flooded Hazard
  const candidateKeys: Array<'safe' | 'balanced' | 'fast'> = ['safe', 'balanced', 'fast']
  let bestSafeRoute: RouteInfo | null = null

  for (const key of candidateKeys) {
    const candidate = computedRoutes[key]
    if (!candidate || !candidate.geoJSON?.geometry?.coordinates) continue

    const coords = candidate.geoJSON.geometry.coordinates as [number, number][]
    const intersection = routeIntersectsHazards(coords, [hazardToAvoid], 0.05)

    if (!intersection.isUnsafe) {
      bestSafeRoute = candidate
      break
    }
  }

  // If even 'safe' is slightly close, check if its min distance is better than 40m
  if (!bestSafeRoute && computedRoutes.safe) {
    const coords = computedRoutes.safe.geoJSON?.geometry?.coordinates as [number, number][]
    if (coords) {
      const intersection = routeIntersectsHazards(coords, [hazardToAvoid], 0.04)
      if (!intersection.isUnsafe) {
        bestSafeRoute = computedRoutes.safe
      }
    }
  }

  // 4. Handle Success Case
  if (bestSafeRoute) {
    const newEtaMinutes = parseEtaMinutes(bestSafeRoute.time)
    const etaDiffMinutes = Math.max(0, newEtaMinutes - oldEtaMinutes)

    return {
      success: true,
      newRoute: bestSafeRoute,
      oldEtaMinutes,
      newEtaMinutes,
      etaDiffMinutes,
      distanceKm: bestSafeRoute.distanceKm,
      emergencyHotlines: DEFAULT_EMERGENCY_HOTLINES,
    }
  }

  // 5. Handle "No Alternate Safe Route Exists" Case
  // Calculate nearest evacuation center / safe point
  let nearestShelter: SafeShelterInfo | undefined

  if (availableShelters && availableShelters.length > 0) {
    let minShelterDist = Infinity
    for (const sh of availableShelters) {
      const d = calculateDistanceKm(userCoords.lat, userCoords.lng, sh.lat, sh.lng)
      if (d < minShelterDist) {
        minShelterDist = d
        nearestShelter = {
          name: sh.name,
          lat: sh.lat,
          lng: sh.lng,
          distKm: Math.round(d * 10) / 10,
          distanceText: formatDistance(d),
          status: sh.status || 'Active Safe Zone',
        }
      }
    }
  }

  if (!nearestShelter) {
    nearestShelter = {
      name: 'San Fernando Central Evacuation Center',
      lat: 15.032,
      lng: 120.689,
      distKm: 1.4,
      distanceText: '1.4 km',
      status: 'Highland Shelter Open',
    }
  }

  return {
    success: false,
    oldEtaMinutes,
    reason: 'No flood-free alternative route found. All surrounding municipal bypasses are blocked or submerged.',
    nearestShelter,
    emergencyHotlines: DEFAULT_EMERGENCY_HOTLINES,
  }
}
