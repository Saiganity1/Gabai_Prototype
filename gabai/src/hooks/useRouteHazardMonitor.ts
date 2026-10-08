import { useState, useEffect, useRef, useCallback } from 'react'
import { Hazard, RoadSegment } from '../components/MapCanvas'
import { CitizenReport } from '../context/DisasterContext'
import { RouteInfo } from '../utils/routingEngine'
import { evaluateHazardOnRoute, HazardOnRouteEvaluation, formatHazardDistance } from '../utils/routeHazardSpatial'
import { hazardFeedback } from '../utils/hazardAlertFeedback'
import { calculateDistanceKm } from './useUserLocation'

export interface ActiveHazardAlertData {
  hazard: Hazard | CitizenReport
  evaluation: HazardOnRouteEvaluation
  roadName: string
  distanceAheadText: string
  reportedAgoText: string
  reportCount: number
  severity: 'high' | 'medium' | 'low'
  affectedSegmentCoords: [number, number][]
  timestamp: number
}

export interface UseRouteHazardMonitorOptions {
  activeRoute: RouteInfo | null
  isNavigating: boolean
  userLocation: { lat: number; lng: number }
  hazards: Hazard[]
  reports: CitizenReport[]
  onHazardAlertTriggered?: (alert: ActiveHazardAlertData) => void
}

export type GpsTrackingStatus = 'idle' | 'tracking' | 'denied' | 'lost'

export function useRouteHazardMonitor({
  activeRoute,
  isNavigating,
  userLocation,
  hazards,
  reports,
  onHazardAlertTriggered,
}: UseRouteHazardMonitorOptions) {
  // Current monitored route polyline coordinates: [[lng, lat], ...]
  const [routePolyline, setRoutePolyline] = useState<[number, number][]>([])

  // Live tracked driver coordinates
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number }>(userLocation)
  const [gpsStatus, setGpsStatus] = useState<GpsTrackingStatus>('idle')

  // Currently active modal alert (if any)
  const [activeAlert, setActiveAlert] = useState<ActiveHazardAlertData | null>(null)

  // Tracked sets of hazard IDs
  const alertedIdsRef = useRef<Set<string>>(new Set())
  const [continuedHazardIds, setContinuedHazardIds] = useState<string[]>(() => {
    try {
      const saved = sessionStorage.getItem('gabai-continued-hazard-ids')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })

  // Flooded segments kept marked red (both active and continued hazards)
  const [redSegmentOnRoute, setRedSegmentOnRoute] = useState<[number, number][] | null>(null)
  const [pulsingHazardPoint, setPulsingHazardPoint] = useState<{ lat: number; lng: number; label: string } | null>(null)

  // Debouncing refs (3-5 seconds or 20 meters movement)
  const lastCheckTimeRef = useRef<number>(0)
  const lastCheckLocationRef = useRef<{ lat: number; lng: number } | null>(null)
  const watchIdRef = useRef<number | null>(null)

  // Update route polyline in state when active route changes
  useEffect(() => {
    if (activeRoute?.geoJSON?.geometry?.coordinates) {
      const coords = activeRoute.geoJSON.geometry.coordinates as [number, number][]
      if (Array.isArray(coords) && coords.length > 1) {
        setRoutePolyline(coords)
        return
      }
    }
    if (!isNavigating) {
      setRoutePolyline([])
      setActiveAlert(null)
      setRedSegmentOnRoute(null)
      setPulsingHazardPoint(null)
    }
  }, [activeRoute, isNavigating])

  // Sync userLocation from props if no active watch position
  useEffect(() => {
    if (gpsStatus !== 'tracking') {
      setDriverLocation(userLocation)
    }
  }, [userLocation, gpsStatus])

  // ── 1. Geolocation Tracking (watchPosition) when route begins ──
  useEffect(() => {
    if (!isNavigating || typeof window === 'undefined') {
      if (watchIdRef.current !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      setGpsStatus('idle')
      return
    }

    if (!('geolocation' in navigator)) {
      setGpsStatus('lost')
      return
    }

    setGpsStatus('tracking')

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        setDriverLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        })
        setGpsStatus('tracking')
      },
      (error) => {
        console.warn('Geolocation error during route navigation:', error)
        if (error.code === error.PERMISSION_DENIED) {
          setGpsStatus('denied')
        } else {
          setGpsStatus('lost')
        }
        // Graceful fallback: maintain last known user location
        setDriverLocation((prev) => prev || userLocation)
      },
      {
        enableHighAccuracy: true,
        maximumAge: 3000,
        timeout: 10000,
      }
    )

    return () => {
      if (watchIdRef.current !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
    }
  }, [isNavigating, userLocation])

  // ── 2. Evaluate Hazards Ahead of Driver on Active Route ───────
  const evaluateHazardsOnRoute = useCallback(
    (forceCheck = false, customLoc?: { lat: number; lng: number }) => {
      if (!isNavigating || routePolyline.length < 2) return

      const currentLoc = customLoc || driverLocation
      const now = Date.now()

      // Debounce: Skip evaluation unless forced, or moved >= 20m, or >= 3.5s elapsed
      if (!forceCheck && lastCheckLocationRef.current) {
        const distMovedKm = calculateDistanceKm(
          lastCheckLocationRef.current.lat,
          lastCheckLocationRef.current.lng,
          currentLoc.lat,
          currentLoc.lng
        )
        const timeElapsed = now - lastCheckTimeRef.current
        if (distMovedKm < 0.02 && timeElapsed < 3500) {
          return // Debounced
        }
      }

      lastCheckLocationRef.current = currentLoc
      lastCheckTimeRef.current = now

      // Aggregate all active candidate hazards (combining reports and hazards)
      const allCandidates: Array<Hazard | CitizenReport> = []

      // Add citizen reports
      for (const r of reports) {
        if (r.status !== 'resolved' && r.status !== 'rejected') {
          allCandidates.push(r)
        }
      }

      // Add mapped hazards
      for (const h of hazards) {
        if (h.status !== 'Resolved' && !String(h.status).toLowerCase().includes('reject')) {
          const alreadyIn = allCandidates.some((c) => String(c.id) === String(h.id))
          if (!alreadyIn) allCandidates.push(h)
        }
      }

      // Find the closest hazard ahead that meets all criteria
      let candidateAlert: ActiveHazardAlertData | null = null
      let closestDistanceAhead = Infinity

      for (const item of allCandidates) {
        const itemId = String(item.id)

        // Check if not already alerted
        if (alertedIdsRef.current.has(itemId)) {
          continue
        }

        // Check with Turf.js: within ~40m of route, ahead of user, within ~5km
        const evaluation = evaluateHazardOnRoute(routePolyline, currentLoc, item, 40, 5.0)

        if (evaluation.shouldAlert) {
          if (evaluation.distanceAheadKm < closestDistanceAhead) {
            closestDistanceAhead = evaluation.distanceAheadKm

            const roadName =
              evaluation.roadName ||
              (item as any).roadSegment?.roadName ||
              (item as any).locationName ||
              (item as any).label ||
              'Road Ahead'

            const repAgo = (item as any).ago || (item as any).time || 'Recently'
            const repCount = Math.max(1, (item as any).reports || (item as any).verified || 1)
            const sev: 'high' | 'medium' | 'low' = (item as any).severity || 'high'

            candidateAlert = {
              hazard: item,
              evaluation,
              roadName,
              distanceAheadText: formatHazardDistance(evaluation.distanceAheadKm),
              reportedAgoText: repAgo,
              reportCount: repCount,
              severity: sev,
              affectedSegmentCoords: evaluation.affectedSegmentCoords,
              timestamp: now,
            }
          }
        }
      }

      // Trigger Alert if a qualifying hazard is detected
      if (candidateAlert && (!activeAlert || candidateAlert.hazard.id !== activeAlert.hazard.id)) {
        alertedIdsRef.current.add(String(candidateAlert.hazard.id))
        setActiveAlert(candidateAlert)

        // Mark flooded segment in RED
        if (candidateAlert.affectedSegmentCoords.length > 0) {
          setRedSegmentOnRoute(candidateAlert.affectedSegmentCoords)
        }

        // Set pulsing marker on route
        const [pLng, pLat] = candidateAlert.evaluation.hazardPointOnRoute
        setPulsingHazardPoint({
          lat: pLat,
          lng: pLng,
          label: candidateAlert.roadName,
        })

        // Trigger multisensory feedback (audio chime + vibration)
        hazardFeedback.triggerAll(candidateAlert.roadName, candidateAlert.distanceAheadText)

        if (onHazardAlertTriggered) {
          onHazardAlertTriggered(candidateAlert)
        }
      }
    },
    [isNavigating, routePolyline, driverLocation, reports, hazards, activeAlert, onHazardAlertTriggered]
  )

  // Run evaluation on location movement or candidate hazards update
  useEffect(() => {
    if (isNavigating && routePolyline.length >= 2) {
      evaluateHazardsOnRoute(false)
    }
  }, [isNavigating, routePolyline, driverLocation, reports, hazards, evaluateHazardsOnRoute])

  // ── 3. Listen to Real-Time Flood Reports via Backend Sync ─────
  useEffect(() => {
    if (typeof window === 'undefined') return

    // BroadcastChannel listener
    let bc: BroadcastChannel | null = null
    try {
      if ('BroadcastChannel' in window) {
        bc = new BroadcastChannel('gabai-sync-channel')
        bc.onmessage = (event) => {
          if (event.data?.type === 'SYNC_REPORTS' || event.data?.type === 'SYNC_HAZARDS' || event.data?.type === 'REPORT_SUBMITTED') {
            evaluateHazardsOnRoute(true)
          }
        }
      }
    } catch {}

    // Storage listener
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'gabai-live-reports' || e.key === 'gabai-live-hazards') {
        evaluateHazardsOnRoute(true)
      }
    }
    window.addEventListener('storage', handleStorage)

    return () => {
      window.removeEventListener('storage', handleStorage)
      if (bc) bc.close()
    }
  }, [evaluateHazardsOnRoute])

  // ── User Actions ──────────────────────────────────────────────
  const dismissAlert = useCallback(() => {
    setActiveAlert(null)
  }, [])

  /**
   * User chose "Continue Anyway": confirm and keep segment marked RED on map
   */
  const confirmContinueAnyway = useCallback((hazardId: string | number) => {
    const idStr = String(hazardId)
    setContinuedHazardIds((prev) => {
      const next = Array.from(new Set([...prev, idStr]))
      try {
        sessionStorage.setItem('gabai-continued-hazard-ids', JSON.stringify(next))
      } catch {}
      return next
    })
    alertedIdsRef.current.add(idStr)
    setActiveAlert(null)
    // Red segment remains marked on map!
  }, [])

  /**
   * Helper to manually test/simulate driver position along the route
   */
  const setSimulatedPosition = useCallback(
    (lat: number, lng: number) => {
      setDriverLocation({ lat, lng })
      evaluateHazardsOnRoute(true, { lat, lng })
    },
    [evaluateHazardsOnRoute]
  )

  /**
   * Helper to inject a simulated flood report ahead on the route for testing
   */
  const injectSimulatedHazardAhead = useCallback(
    (distanceAheadKm = 0.45, roadName = 'MacArthur Highway') => {
      if (routePolyline.length < 2) return null

      // Find coordinate ~distanceAheadKm ahead
      const targetIdx = Math.min(routePolyline.length - 1, Math.max(1, Math.floor(routePolyline.length * 0.4)))
      const [hLng, hLat] = routePolyline[targetIdx]

      const fakeReport: CitizenReport = {
        id: `sim-flood-${Date.now()}`,
        citizen: 'Motorist Patrol (Simulated)',
        type: 'flood',
        emoji: '🌊',
        desc: `Flooding reported ahead on ${roadName}. Water depth ~0.4m, impassable for light vehicles.`,
        lat: hLat,
        lng: hLng,
        severity: 'high',
        time: 'Just now',
        status: 'pending',
        locationName: roadName,
        isRoadSegment: true,
        roadSegment: {
          from: { lat: hLat - 0.001, lng: hLng - 0.001, name: `${roadName} North` },
          to: { lat: hLat + 0.001, lng: hLng + 0.001, name: `${roadName} South` },
          roadName,
          path: [
            [hLng - 0.0015, hLat - 0.001],
            [hLng, hLat],
            [hLng + 0.0015, hLat + 0.001],
          ],
        },
        passability: 'not_passable_light',
        waterDepth: 'Knee Deep (0.40m)',
      }

      // Clear from alerted set to ensure alert fires
      alertedIdsRef.current.delete(String(fakeReport.id))

      // Trigger immediate evaluation
      setTimeout(() => {
        evaluateHazardsOnRoute(true)
      }, 50)

      return fakeReport
    },
    [routePolyline, evaluateHazardsOnRoute]
  )

  return {
    routePolyline,
    driverLocation,
    gpsStatus,
    activeAlert,
    redSegmentOnRoute,
    pulsingHazardPoint,
    continuedHazardIds,
    dismissAlert,
    confirmContinueAnyway,
    evaluateHazardsOnRoute,
    setSimulatedPosition,
    injectSimulatedHazardAhead,
  }
}
