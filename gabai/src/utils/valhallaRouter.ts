/**
 * GABAI Valhalla Real-World Disaster Routing Engine
 * Integrates open-source Valhalla routing with native dynamic flood exclusion polygons.
 *
 * Capabilities:
 * - Native exclude_polygons support: dynamically routes around active flood hazards
 * - OpenStreetMap accurate road network navigation
 * - Automatic decoding of Valhalla polyline6 geometry
 * - Seamless normalization into GABAI route format
 * - High-speed POST queries with tight polygon corridors
 * - Graceful fallback to OSRM / dynamic geometric routing
 */

import { Hazard } from '../components/MapCanvas'
import { routeIntersectsHazards } from './routingEngine'

export const VALHALLA_API_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_VALHALLA_API_URL) ||
  'https://valhalla1.openstreetmap.de/route'

/**
 * Decodes Valhalla polyline6 string into GeoJSON coordinates [longitude, latitude]
 */
export function decodeValhallaPolyline6(str: string): [number, number][] {
  if (!str) return []
  let index = 0
  let lat = 0
  let lng = 0
  const coordinates: [number, number][] = []

  while (index < str.length) {
    let b: number
    let shift = 0
    let result = 0
    do {
      b = str.charCodeAt(index++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    const dlat = result & 1 ? ~(result >> 1) : result >> 1
    lat += dlat

    shift = 0
    result = 0
    do {
      b = str.charCodeAt(index++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    const dlng = result & 1 ? ~(result >> 1) : result >> 1
    lng += dlng

    coordinates.push([lng / 1e6, lat / 1e6])
  }

  return coordinates
}

/**
 * Converts a GABAI Hazard (point or road segment) into a closed polygon ring [lng, lat][]
 * suitable for Valhalla's exclude_polygons parameter.
 * Uses a tight corridor sleeve around road segments so parallel bypass streets remain open.
 */
export function hazardToExcludePolygon(hazard: Hazard, bufferMeters = 40): [number, number][] {
  if (hazard.isRoadSegment && hazard.roadSegment?.path && hazard.roadSegment.path.length > 1) {
    const path = hazard.roadSegment.path
    const leftSide: [number, number][] = []
    const rightSide: [number, number][] = []

    for (let i = 0; i < path.length; i++) {
      const curr = path[i]
      const prev = path[Math.max(0, i - 1)]
      const next = path[Math.min(path.length - 1, i + 1)]
      const dLng = next[0] - prev[0]
      const dLat = next[1] - prev[1]
      const len = Math.hypot(dLng, dLat) || 1
      const perpLng = -dLat / len
      const perpLat = dLng / len
      const latBuf = bufferMeters / 111320
      const lngBuf = bufferMeters / (111320 * Math.cos((curr[1] * Math.PI) / 180))

      leftSide.push([curr[0] + perpLng * lngBuf, curr[1] + perpLat * latBuf])
      rightSide.push([curr[0] - perpLng * lngBuf, curr[1] - perpLat * latBuf])
    }

    return [...leftSide, ...rightSide.reverse(), leftSide[0]]
  }

  // Circular polygon approximation for point hazards (8 vertices)
  const points = 8
  const ring: [number, number][] = []
  const latBuf = bufferMeters / 111320
  const lngBuf = bufferMeters / (111320 * Math.cos((hazard.lat * Math.PI) / 180))

  for (let i = 0; i < points; i++) {
    const angle = (i / points) * 2 * Math.PI
    ring.push([hazard.lng + Math.cos(angle) * lngBuf, hazard.lat + Math.sin(angle) * latBuf])
  }
  ring.push(ring[0]) // Close the polygon ring
  return ring
}

/**
 * Maps Valhalla maneuver types and descriptions into GABAI / OSRM compatible step format
 */
export function convertValhallaTripToOsrmFormat(trip: any): any {
  if (!trip || !trip.legs || trip.legs.length === 0) return null

  const leg = trip.legs[0]
  const coordinates = decodeValhallaPolyline6(leg.shape)
  const distanceMeters = (trip.summary?.length || 0) * 1000
  const durationSeconds = trip.summary?.time || 0

  const steps = (leg.maneuvers || []).map((m: any) => {
    const distM = Math.round((m.length || 0) * 1000)
    const street = m.street_names?.[0] || ''
    const instruction = m.instruction || 'Proceed along road network'
    const instrLower = instruction.toLowerCase()

    let modifier: 'straight' | 'right' | 'left' = 'straight'
    if (instrLower.includes('right')) modifier = 'right'
    else if (instrLower.includes('left')) modifier = 'left'

    let maneuverType = 'turn'
    if (m.type === 4 || m.type === 5 || m.type === 6) maneuverType = 'arrive'
    else if (m.type === 1 || m.type === 2) maneuverType = 'depart'
    else if (m.type === 8) maneuverType = 'continue'

    return {
      distance: distM,
      duration: m.time || 0,
      name: street,
      instruction,
      maneuver: {
        type: maneuverType,
        modifier,
      },
    }
  })

  return {
    distance: distanceMeters,
    duration: durationSeconds,
    geometry: {
      type: 'LineString',
      coordinates,
    },
    legs: [
      {
        distance: distanceMeters,
        duration: durationSeconds,
        steps,
      },
    ],
  }
}

export interface ValhallaCandidate {
  route: any
  distanceKm: number
  durationMin: number
  isSafeAndDry: boolean
  minHazardDistKm: number
  isDetour: boolean
  engine: 'valhalla'
}

/**
 * Queries the Valhalla routing engine with POST method and optional exclude_polygons
 */
export async function queryValhallaRoute(params: {
  originLat: number
  originLng: number
  destLat: number
  destLng: number
  excludePolygons?: [number, number][][]
  timeoutMs?: number
}): Promise<any | null> {
  const { originLat, originLng, destLat, destLng, excludePolygons, timeoutMs = 1200 } = params

  try {
    const requestBody: any = {
      locations: [
        { lat: originLat, lon: originLng },
        { lat: destLat, lon: destLng },
      ],
      costing: 'auto',
      costing_options: {
        auto: {
          use_highways: 1.0,
          use_tolls: 0.8,
        },
      },
    }

    if (excludePolygons && excludePolygons.length > 0) {
      requestBody.exclude_polygons = excludePolygons
      if (!requestBody.costing_options) requestBody.costing_options = {}
      if (!requestBody.costing_options.auto) requestBody.costing_options.auto = {}
      requestBody.costing_options.auto.exclude_polygons = excludePolygons
    }

    const res = await fetch(VALHALLA_API_URL, {
      method: 'POST',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    if (!res.ok) return null
    const data = await res.json()

    if (!data.trip || !data.trip.legs || data.trip.legs.length === 0) return null

    return convertValhallaTripToOsrmFormat(data.trip)
  } catch {
    // Graceful silent fallback if Valhalla is unreachable
    return null
  }
}

/**
 * Fetches Valhalla route candidates with active flood avoidance
 */
export async function fetchValhallaCandidates(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  activeHazards: Hazard[] = []
): Promise<ValhallaCandidate[]> {
  const candidates: ValhallaCandidate[] = []

  // Build exclude polygons from all active flood hazards
  const floodPolygons: [number, number][][] = []
  for (const hz of activeHazards) {
    if (hz && hz.status !== 'Resolved') {
      const poly = hazardToExcludePolygon(hz, 40)
      if (poly.length >= 4) {
        floodPolygons.push(poly)
      }
    }
  }

  // Limit to at most 16 polygons to keep fast response
  const boundedPolygons = floodPolygons.slice(0, 16)

  const requests: Promise<any>[] = []

  // 1. Direct Valhalla route
  requests.push(
    queryValhallaRoute({
      originLat,
      originLng,
      destLat,
      destLng,
      timeoutMs: 4000,
    })
  )

  // 2. Safe detour Valhalla route (if active hazards exist)
  if (boundedPolygons.length > 0) {
    requests.push(
      queryValhallaRoute({
        originLat,
        originLng,
        destLat,
        destLng,
        excludePolygons: boundedPolygons,
        timeoutMs: 4500,
      })
    )
  }

  const results = await Promise.allSettled(requests)

  const directTrip = results[0]?.status === 'fulfilled' ? results[0].value : null
  const safeTrip = results[1]?.status === 'fulfilled' ? results[1].value : null

  if (directTrip && directTrip.geometry?.coordinates?.length > 1) {
    const coords: [number, number][] = directTrip.geometry.coordinates
    const hazardCheck = routeIntersectsHazards(coords, activeHazards, 0.020)
    candidates.push({
      route: directTrip,
      distanceKm: directTrip.distance / 1000,
      durationMin: Math.max(1, Math.round(directTrip.duration / 60)),
      isSafeAndDry: !hazardCheck.isUnsafe,
      minHazardDistKm: hazardCheck.minHazardDistanceKm,
      isDetour: false,
      engine: 'valhalla',
    })
  }

  if (safeTrip && safeTrip.geometry?.coordinates?.length > 1) {
    const coords: [number, number][] = safeTrip.geometry.coordinates
    const hazardCheck = routeIntersectsHazards(coords, activeHazards, 0.020)
    candidates.push({
      route: safeTrip,
      distanceKm: safeTrip.distance / 1000,
      durationMin: Math.max(1, Math.round(safeTrip.duration / 60)),
      isSafeAndDry: !hazardCheck.isUnsafe,
      minHazardDistKm: hazardCheck.minHazardDistanceKm,
      isDetour: true,
      engine: 'valhalla',
    })
  }

  return candidates
}
