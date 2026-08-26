import { useState, useCallback, useRef, useEffect, useMemo, useImperativeHandle, forwardRef } from 'react'
import Map, { Source, Layer, Marker, Popup, NavigationControl } from 'react-map-gl/maplibre'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { UserCoordinates } from '../hooks/useUserLocation'
import { RouteInfo } from '../utils/routingEngine'

export interface RoadSegment {
  from: { lat: number; lng: number; name?: string }
  to: { lat: number; lng: number; name?: string }
  path?: [number, number][]
  roadName?: string
}

export type PassabilityType = 'all_passable' | 'not_passable_light' | 'not_passable_all'

export interface Hazard {
  id: number | string
  type: string
  emoji: string
  label: string
  lat: number
  lng: number
  severity: 'high' | 'medium' | 'low'
  confidence: number
  distance: string
  reports: number
  verified: number
  ago: string
  status: string
  isRoadSegment?: boolean
  roadSegment?: RoadSegment
  passability?: PassabilityType
  waterDepth?: string
  isVerified?: boolean
}

export interface MapCanvasHandle {
  flyToUser: () => void
  flyToCoords: (lat: number, lng: number, zoom?: number) => void
  set3DMode: (is3D: boolean) => void
  toggle3D: () => void
}

interface Props {
  darkMode: boolean
  selectedHazard: Hazard | null
  showRoutes: boolean
  selectedRoute: string | null
  onHazardClick: (h: Hazard) => void
  emergencyMode: boolean
  navPosition?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'
  userLocation?: UserCoordinates
  hazards?: Hazard[]
  evacCenters?: Array<{ name: string; lat: number; lng: number; dist?: string; cap?: string; status?: string }>
  routes?: Record<'safe' | 'balanced' | 'fast', RouteInfo>
  destination?: { name: string; lat: number; lng: number } | null
  onMapClick?: (coords: { lat: number; lng: number }) => void
  flyToTrigger?: number
  showRadar?: boolean
  show3DBuildings?: boolean
  showDangerZones?: boolean
  showRoadLines?: boolean
  showEvacCenters?: boolean
  is3D?: boolean
  onToggle3D?: () => void
  isPickingRoadSegment?: 'from' | 'to' | null
}

const SEVERITY_COLORS: Record<string, string> = {
  high: '#EF4444',
  medium: '#F59E0B',
  low: '#3B82F6',
}

/**
 * Generates an accurate geographic circle polygon in real meters
 */
function createGeoCircle(center: [number, number], radiusMeters: number, points = 64) {
  const [lng, lat] = center
  const coords: [number, number][] = []
  const distanceX = radiusMeters / (111320 * Math.cos((lat * Math.PI) / 180))
  const distanceY = radiusMeters / 110574

  for (let i = 0; i <= points; i++) {
    const theta = (i / points) * (2 * Math.PI)
    const x = distanceX * Math.cos(theta)
    const y = distanceY * Math.sin(theta)
    coords.push([lng + x, lat + y])
  }

  return {
    type: 'Feature' as const,
    geometry: {
      type: 'Polygon' as const,
      coordinates: [coords],
    },
  }
}

const MAPTILER_KEY = 'nTk681BgoYKH6JYBCUgo'

const MapCanvas = forwardRef<MapCanvasHandle, Props>(function MapCanvas(
  {
    darkMode,
    selectedHazard,
    showRoutes,
    selectedRoute,
    onHazardClick,
    emergencyMode,
    navPosition = 'top-right',
    userLocation = { lat: 14.5995, lng: 120.9842, accuracy: 25 },
    hazards = [],
    evacCenters = [],
    routes,
    destination,
    onMapClick,
    flyToTrigger,
    showRadar = true,
    show3DBuildings = true,
    showDangerZones = true,
    showRoadLines = true,
    showEvacCenters = true,
    is3D = true,
    onToggle3D,
  },
  ref
) {
  const mapRef = useRef<any>(null)
  const initialCentered = useRef(false)
  const rafRef = useRef<number | null>(null)

  const lightStyle: any = {
    version: 8,
    sources: {
      'maptiler-voyager': {
        type: 'raster',
        tiles: [
          `https://api.maptiler.com/maps/voyager/256/{z}/{x}/{y}@2x.png?key=${MAPTILER_KEY}`,
        ],
        tileSize: 256,
        attribution: '&copy; <a href="https://www.maptiler.com/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      },
    },
    layers: [
      {
        id: 'maptiler-voyager-layer',
        type: 'raster',
        source: 'maptiler-voyager',
        minzoom: 0,
        maxzoom: 22,
      },
    ],
  }

  const darkStyle: any = {
    version: 8,
    sources: {
      'carto-dark': {
        type: 'raster',
        tiles: [
          'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
          'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
          'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
          'https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        ],
        tileSize: 256,
        attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      },
    },
    layers: [
      {
        id: 'carto-dark-layer',
        type: 'raster',
        source: 'carto-dark',
        minzoom: 0,
        maxzoom: 22,
      },
    ],
  }

  const userLat = userLocation?.lat ?? 14.5995
  const userLng = userLocation?.lng ?? 120.9842

  const flyToUser = () => {
    if (mapRef.current && userLat && userLng) {
      mapRef.current.flyTo({
        center: [userLng, userLat],
        zoom: 15,
        pitch: is3D ? 60 : 0,
        bearing: is3D ? -15 : 0,
        duration: 1200,
        essential: true,
      })
    }
  }

  useImperativeHandle(ref, () => ({
    flyToUser,
    flyToCoords: (lat: number, lng: number, zoom = 15) => {
      mapRef.current?.flyTo({
        center: [lng, lat],
        zoom,
        pitch: is3D ? 60 : 0,
        duration: 1200,
        essential: true,
      })
    },
    set3DMode: (threeD: boolean) => {
      mapRef.current?.easeTo({
        pitch: threeD ? 60 : 0,
        bearing: threeD ? -15 : 0,
        duration: 600,
      })
    },
    toggle3D: () => {
      const currentPitch = mapRef.current?.getPitch() || 0
      const nextPitch = currentPitch > 20 ? 0 : 60
      mapRef.current?.easeTo({
        pitch: nextPitch,
        bearing: nextPitch > 0 ? -15 : 0,
        duration: 600,
      })
    },
  }))

  useEffect(() => {
    if (!initialCentered.current && userLat && userLng) {
      if (userLat !== 14.5995 || userLng !== 120.9842) {
        initialCentered.current = true
        flyToUser()
      }
    }
  }, [userLat, userLng])

  useEffect(() => {
    if (flyToTrigger && flyToTrigger > 0) {
      flyToUser()
    }
  }, [flyToTrigger])

  // Geodesic Danger Zones for standard point hazards
  const hazardZonesGeoJSON = useMemo(() => {
    return {
      type: 'FeatureCollection' as const,
      features: hazards
        .filter((h) => !h.isRoadSegment && h.status !== 'Resolved')
        .map((h) => {
          const radius =
            h.severity === 'high' ? 200 : h.severity === 'medium' ? 120 : 60
          const color = SEVERITY_COLORS[h.severity] || '#EF4444'
          const feat = createGeoCircle([h.lng, h.lat], radius)
          return {
            ...feat,
            properties: {
              id: h.id,
              severity: h.severity,
              color,
              isSelected: selectedHazard?.id === h.id,
            },
          }
        }),
    }
  }, [hazards, selectedHazard])

// Interpolate points between two coordinates for smooth 3D line rendering
function interpolateSegment(
  from: [number, number],
  to: [number, number],
  steps = 25
): [number, number][] {
  const result: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const lng = from[0] + (to[0] - from[0]) * t
    const lat = from[1] + (to[1] - from[1]) * t
    result.push([lng, lat])
  }
  return result
}

  // ── Road Flood LineString Segments (Orange = Unverified, Blue = Verified) ──
  const unverifiedRoadLinesGeoJSON = useMemo(() => {
    const list = hazards.filter(
      (h) =>
        h.isRoadSegment &&
        h.roadSegment &&
        h.roadSegment.from &&
        h.roadSegment.to &&
        !((h.verified && h.verified > 0) || h.isVerified || h.status === 'Verified' || h.status?.includes('Verified')) &&
        h.status !== 'Resolved'
    )

    return {
      type: 'FeatureCollection' as const,
      features: list.map((h) => {
        const seg = h.roadSegment!
        const coords =
          seg.path && seg.path.length > 1
            ? seg.path
            : interpolateSegment([seg.from.lng, seg.from.lat], [seg.to.lng, seg.to.lat], 25)

        return {
          type: 'Feature' as const,
          geometry: {
            type: 'LineString' as const,
            coordinates: coords,
          },
          properties: {
            id: String(h.id),
          },
        }
      }),
    }
  }, [hazards])

  const verifiedRoadLinesGeoJSON = useMemo(() => {
    const list = hazards.filter(
      (h) =>
        h.isRoadSegment &&
        h.roadSegment &&
        h.roadSegment.from &&
        h.roadSegment.to &&
        Boolean((h.verified && h.verified > 0) || h.isVerified || h.status === 'Verified' || h.status?.includes('Verified')) &&
        h.status !== 'Resolved'
    )

    return {
      type: 'FeatureCollection' as const,
      features: list.map((h) => {
        const seg = h.roadSegment!
        const coords =
          seg.path && seg.path.length > 1
            ? seg.path
            : interpolateSegment([seg.from.lng, seg.from.lat], [seg.to.lng, seg.to.lat], 25)

        return {
          type: 'Feature' as const,
          geometry: {
            type: 'LineString' as const,
            coordinates: coords,
          },
          properties: {
            id: String(h.id),
          },
        }
      }),
    }
  }, [hazards])

  // Accurate User GPS Accuracy Perimeter
  const userAccuracyGeoJSON = useMemo(() => {
    const radius = Math.min(Math.max(userLocation.accuracy || 35, 20), 80)
    return createGeoCircle([userLng, userLat], radius)
  }, [userLng, userLat, userLocation.accuracy])

  // PAGASA Doppler Weather Radar Simulated Storm Cell Polygons
  const radarPrecipitationGeoJSON = useMemo(() => {
    if (!showRadar) return null
    return {
      type: 'FeatureCollection' as const,
      features: [
        {
          ...createGeoCircle([userLng - 0.018, userLat + 0.015], 1800),
          properties: { color: '#EF4444', intensity: 'Heavy Precipitation (35mm/hr)' },
        },
        {
          ...createGeoCircle([userLng + 0.022, userLat - 0.012], 2400),
          properties: { color: '#F59E0B', intensity: 'Moderate Rain (15mm/hr)' },
        },
        {
          ...createGeoCircle([userLng, userLat], 3200),
          properties: { color: '#10B981', intensity: 'Scattered Showers' },
        },
      ],
    }
  }, [showRadar, userLng, userLat])

  const [screenLines, setScreenLines] = useState<
    Array<{
      id: string | number
      points: string
      color: string
    }>
  >([])

  const updateScreenLines = useCallback(() => {
    if (!showRoadLines) {
      if (screenLines.length > 0) setScreenLines([])
      return
    }

    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
    }

    rafRef.current = requestAnimationFrame(() => {
      if (!mapRef.current) return
      const map = mapRef.current.getMap ? mapRef.current.getMap() : mapRef.current
      if (!map || typeof map.project !== 'function') return

      const roadHazards = hazards.filter(
        (h) =>
          h.isRoadSegment &&
          h.roadSegment &&
          h.roadSegment.from &&
          h.roadSegment.to &&
          typeof h.roadSegment.from.lng === 'number' &&
          typeof h.roadSegment.from.lat === 'number' &&
          typeof h.roadSegment.to.lng === 'number' &&
          typeof h.roadSegment.to.lat === 'number' &&
          h.status !== 'Resolved'
      )

      const lines = roadHazards
        .map((h) => {
          const seg = h.roadSegment!
          const isVerified = Boolean(
            (h.verified && h.verified > 0) ||
              h.isVerified ||
              h.status === 'Verified' ||
              h.status?.includes('Verified')
          )
          const color = isVerified ? '#2563EB' : '#F97316'

          const rawCoords: [number, number][] =
            seg.path && seg.path.length > 1
              ? seg.path
              : interpolateSegment([seg.from.lng, seg.from.lat], [seg.to.lng, seg.to.lat], 25)

          try {
            const projected = rawCoords.map(([lng, lat]) => {
              const p = map.project([lng, lat])
              return `${p.x.toFixed(1)},${p.y.toFixed(1)}`
            })
            return {
              id: h.id,
              points: projected.join(' '),
              color,
            }
          } catch {
            return null
          }
        })
        .filter(Boolean) as Array<{
        id: string | number
        points: string
        color: string
      }>

      setScreenLines(lines)
    })
  }, [hazards, showRoadLines, screenLines.length])

  useEffect(() => {
    updateScreenLines()
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [hazards, showRoadLines, updateScreenLines])

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* ── Floating 2D / 3D Perspective Switcher Pill ── */}
      {onToggle3D && (
        <div className="absolute top-28 right-2.5 z-20 pointer-events-auto shadow-xl">
          <button
            type="button"
            onClick={onToggle3D}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl shadow-md border backdrop-blur-md transition-all font-black text-xs active:scale-95 cursor-pointer ${
              is3D
                ? 'bg-blue-600 text-white border-blue-400 shadow-blue-500/25 ring-2 ring-blue-400/30'
                : 'bg-white/95 dark:bg-slate-800/95 text-slate-800 dark:text-slate-100 border-slate-200/60 dark:border-slate-700/60'
            }`}
            title={is3D ? 'Current: 3D Angled View (Click for 2D Top-Down)' : 'Current: 2D Flat View (Click for 3D Angled)'}
          >
            <span className="text-sm">{is3D ? '🧊' : '🗺️'}</span>
            <span>{is3D ? '3D VIEW' : '2D VIEW'}</span>
          </button>
        </div>
      )}

      {/* ── Direct Visual SVG Road Flood Connector (Aligned Along Exact Road Geometry) ── */}
      {showRoadLines && screenLines.length > 0 && (
        <svg className="absolute inset-0 pointer-events-none z-10 w-full h-full overflow-visible">
          {screenLines.map((line) => (
            <g key={`svg-road-line-${line.id}`}>
              {/* Outer Glow */}
              <polyline
                points={line.points}
                fill="none"
                stroke={line.color}
                strokeWidth="18"
                strokeOpacity="0.45"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Main Solid Line */}
              <polyline
                points={line.points}
                fill="none"
                stroke={line.color}
                strokeWidth="8"
                strokeOpacity="1"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Center White Stripes */}
              <polyline
                points={line.points}
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="2.5"
                strokeDasharray="8,8"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeOpacity="0.9"
              />
            </g>
          ))}
        </svg>
      )}

      <Map
        ref={mapRef}
        mapLib={maplibregl}
        reuseMaps={true}
        initialViewState={{
          longitude: userLng,
          latitude: userLat,
          zoom: 14,
          pitch: is3D ? 60 : 0,
          bearing: is3D ? -15 : 0,
        }}
        style={{ width: '100%', height: '100%' }}
        mapStyle={darkMode ? darkStyle : lightStyle}
        maxBounds={[[114.0, 4.0], [127.0, 22.0]]}
        minZoom={5}
        onMove={updateScreenLines}
        onRender={updateScreenLines}
        onLoad={updateScreenLines}
        onClick={(e) => {
          if (onMapClick && e.lngLat) {
            onMapClick({ lat: e.lngLat.lat, lng: e.lngLat.lng })
          }
        }}
      >
      <NavigationControl position={navPosition} />

      {/* ── True 3D Extruded Buildings Vector Layer (Active only in 3D Mode) ── */}
      {show3DBuildings && is3D && (
        <Source
          id="maptiler-buildings-source"
          type="vector"
          tiles={[`https://api.maptiler.com/tiles/v3/{z}/{x}/{y}.pbf?key=${MAPTILER_KEY}`]}
          minzoom={13}
          maxzoom={20}
        >
          <Layer
            id="3d-buildings"
            source-layer="building"
            type="fill-extrusion"
            minzoom={13}
            paint={{
              'fill-extrusion-color': darkMode ? '#334155' : '#cbd5e1',
              'fill-extrusion-height': [
                'case',
                ['has', 'render_height'],
                ['get', 'render_height'],
                ['has', 'height'],
                ['get', 'height'],
                ['has', 'levels'],
                ['*', ['get', 'levels'], 3.8],
                18,
              ],
              'fill-extrusion-base': [
                'case',
                ['has', 'render_min_height'],
                ['get', 'render_min_height'],
                0,
              ],
              'fill-extrusion-opacity': 0.85,
            }}
          />
        </Source>
      )}

      {/* ── PAGASA Doppler Weather Radar Layer ── */}
      {showRadar && radarPrecipitationGeoJSON && (
        <Source id="pagasa-radar-source" type="geojson" data={radarPrecipitationGeoJSON}>
          <Layer
            id="pagasa-radar-fill"
            type="fill"
            paint={{
              'fill-color': ['get', 'color'],
              'fill-opacity': 0.08,
            }}
          />
          <Layer
            id="pagasa-radar-line"
            type="line"
            paint={{
              'line-color': ['get', 'color'],
              'line-width': 1.5,
              'line-dasharray': [3, 2],
              'line-opacity': 0.4,
            }}
          />
        </Source>
      )}

      {/* ── Geographically Accurate Danger Zones ── */}
      {showDangerZones && (
        <Source id="hazard-zones-source" type="geojson" data={hazardZonesGeoJSON}>
          <Layer
            id="hazard-zones-fill"
            type="fill"
            paint={{
              'fill-color': ['get', 'color'],
              'fill-opacity': ['case', ['get', 'isSelected'], 0.35, 0.16],
            }}
          />
          <Layer
            id="hazard-zones-line"
            type="line"
            paint={{
              'line-color': ['get', 'color'],
              'line-width': ['case', ['get', 'isSelected'], 3, 1.5],
              'line-opacity': 0.85,
            }}
          />
        </Source>
      )}

      {/* ── 1. Orange Road Flood Lines (Pending LGU) ── */}
      {showRoadLines && (
        <Source id="orange-road-flood-source" type="geojson" data={unverifiedRoadLinesGeoJSON}>
          <Layer
            id="orange-road-glow"
          type="line"
          layout={{
            'line-cap': 'round',
            'line-join': 'round',
          }}
          paint={{
            'line-color': '#F97316',
            'line-width': 18,
            'line-blur': 6,
            'line-opacity': 0.75,
          }}
        />
        <Layer
          id="orange-road-main"
          type="line"
          layout={{
            'line-cap': 'round',
            'line-join': 'round',
          }}
          paint={{
            'line-color': '#F97316',
            'line-width': 8,
            'line-opacity': 1.0,
          }}
        />
        <Layer
          id="orange-road-stripes"
          type="line"
          layout={{
            'line-cap': 'round',
            'line-join': 'round',
          }}
          paint={{
            'line-color': '#FFFFFF',
            'line-width': 2.5,
            'line-opacity': 0.9,
          }}
        />
      </Source>
      )}

      {/* ── 2. Blue Road Flood Lines (LGU Verified) ── */}
      {showRoadLines && (
        <Source id="blue-road-flood-source" type="geojson" data={verifiedRoadLinesGeoJSON}>
          <Layer
            id="blue-road-glow"
            type="line"
            layout={{
              'line-cap': 'round',
              'line-join': 'round',
            }}
            paint={{
              'line-color': '#2563EB',
              'line-width': 18,
              'line-blur': 6,
              'line-opacity': 0.75,
            }}
          />
          <Layer
            id="blue-road-main"
            type="line"
            layout={{
              'line-cap': 'round',
              'line-join': 'round',
            }}
            paint={{
              'line-color': '#2563EB',
              'line-width': 8,
              'line-opacity': 1.0,
            }}
          />
          <Layer
            id="blue-road-stripes"
            type="line"
            layout={{
              'line-cap': 'round',
              'line-join': 'round',
            }}
            paint={{
              'line-color': '#FFFFFF',
              'line-width': 2.5,
              'line-opacity': 0.9,
            }}
          />
        </Source>
      )}

      {/* ── Accurate User GPS Accuracy Circle ── */}
      <Source id="user-accuracy-source" type="geojson" data={userAccuracyGeoJSON}>
        <Layer
          id="user-accuracy-fill"
          type="fill"
          paint={{
            'fill-color': '#06B6D4',
            'fill-opacity': 0.12,
          }}
        />
        <Layer
          id="user-accuracy-line"
          type="line"
          paint={{
            'line-color': '#06B6D4',
            'line-width': 1.5,
            'line-opacity': 0.6,
          }}
        />
      </Source>

      {/* User GPS Live Beacon Marker */}
      <Marker longitude={userLng} latitude={userLat} anchor="center">
        <div className="relative flex items-center justify-center pointer-events-none">
          <div className="absolute w-8 h-8 rounded-full bg-cyan-500/30 animate-ping" />
          <div className="absolute w-6 h-6 rounded-full bg-cyan-400/40 animate-pulse" />
          <div className="relative w-4 h-4 bg-cyan-500 rounded-full border-2 border-white shadow-lg flex items-center justify-center">
            <div className="w-1.5 h-1.5 bg-white rounded-full" />
          </div>
        </div>
      </Marker>

      {/* Dynamic Route Overlays */}
      {showRoutes && routes && (
        <>
          <Source id="route-fast" type="geojson" data={routes.fast.geoJSON}>
            <Layer
              type="line"
              paint={{
                'line-color': '#EF4444',
                'line-width': selectedRoute === 'fast' ? 7 : 3,
                'line-opacity': selectedRoute === 'fast' ? 1 : 0.25,
              }}
            />
          </Source>
          <Source id="route-balanced" type="geojson" data={routes.balanced.geoJSON}>
            <Layer
              type="line"
              paint={{
                'line-color': '#F59E0B',
                'line-width': selectedRoute === 'balanced' ? 7 : 3,
                'line-opacity': selectedRoute === 'balanced' ? 1 : 0.3,
              }}
            />
          </Source>
          <Source id="route-safe" type="geojson" data={routes.safe.geoJSON}>
            <Layer
              type="line"
              paint={{
                'line-color': '#10B981',
                'line-width': selectedRoute === 'safe' ? 7 : 3.5,
                'line-opacity': selectedRoute === 'safe' ? 1 : 0.4,
              }}
            />
          </Source>
        </>
      )}

      {/* ── Active Target Destination Pin ── */}
      {destination && (
        <Marker longitude={destination.lng} latitude={destination.lat} anchor="bottom">
          <div className="relative flex flex-col items-center pointer-events-none z-30 anim-bounce-short">
            <div className="bg-slate-900 text-white font-bold text-[10px] px-2.5 py-1 rounded-full shadow-xl border border-white/30 whitespace-nowrap mb-1 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>{destination.name}</span>
            </div>
            <div className="w-9 h-9 rounded-full bg-emerald-600 border-2 border-white shadow-2xl flex items-center justify-center text-white text-base">
              🏁
            </div>
            <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[6px] border-t-emerald-600 -mt-0.5" />
          </div>
        </Marker>
      )}

      {/* ── Interactive Road Flood Line Endpoint Markers & Floating Passability Badges ── */}
      {hazards
        .filter((h) => h.isRoadSegment && h.roadSegment && h.status !== 'Resolved')
        .map((h) => {
          const seg = h.roadSegment!
          const isVerified = (h.verified && h.verified > 0) || h.isVerified || h.status === 'Verified'
          const color = isVerified ? '#2563EB' : '#F97316'
          const isSelected = selectedHazard?.id === h.id

          const midLat = (seg.from.lat + seg.to.lat) / 2
          const midLng = (seg.from.lng + seg.to.lng) / 2

          return (
            <div key={`road-flood-markers-${h.id}`}>
              {/* Point A (From) */}
              <Marker longitude={seg.from.lng} latitude={seg.from.lat} anchor="bottom">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onHazardClick(h)
                  }}
                  className="flex flex-col items-center cursor-pointer group"
                >
                  <div
                    className="px-2 py-0.5 rounded-md text-[9px] font-black text-white shadow-md mb-0.5 whitespace-nowrap"
                    style={{ backgroundColor: color }}
                  >
                    Start: {seg.from.name || 'Point A'}
                  </div>
                  <div
                    className="w-6 h-6 rounded-full border-2 border-white flex items-center justify-center text-white text-[10px] font-black shadow-lg group-hover:scale-125 transition-transform"
                    style={{ backgroundColor: color }}
                  >
                    A
                  </div>
                </button>
              </Marker>

              {/* Point B (To) */}
              <Marker longitude={seg.to.lng} latitude={seg.to.lat} anchor="bottom">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onHazardClick(h)
                  }}
                  className="flex flex-col items-center cursor-pointer group"
                >
                  <div
                    className="px-2 py-0.5 rounded-md text-[9px] font-black text-white shadow-md mb-0.5 whitespace-nowrap"
                    style={{ backgroundColor: color }}
                  >
                    End: {seg.to.name || 'Point B'}
                  </div>
                  <div
                    className="w-6 h-6 rounded-full border-2 border-white flex items-center justify-center text-white text-[10px] font-black shadow-lg group-hover:scale-125 transition-transform"
                    style={{ backgroundColor: color }}
                  >
                    B
                  </div>
                </button>
              </Marker>

              {/* Center Floating Passability Badge */}
              <Marker longitude={midLng} latitude={midLat} anchor="center">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onHazardClick(h)
                  }}
                  className="group cursor-pointer transition-transform hover:scale-110 active:scale-95"
                >
                  <div
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 border-white text-white text-[10px] font-black shadow-2xl transition-all ${
                      isSelected ? 'ring-4 ring-cyan-400 scale-105' : ''
                    }`}
                    style={{ backgroundColor: color }}
                  >
                    <span className="text-xs">🌊</span>
                    <span className="uppercase tracking-wider">
                      {isVerified ? 'LGU VERIFIED' : 'PENDING LGU'}
                    </span>
                    <span className="bg-black/30 px-1.5 py-0.5 rounded text-[9px] font-mono font-normal">
                      {h.passability === 'not_passable_all'
                        ? '⛔ CLOSED'
                        : h.passability === 'all_passable'
                        ? '🟢 PASSABLE'
                        : '🚫 NO LIGHT VEHICLES'}
                    </span>
                  </div>
                </button>
              </Marker>
            </div>
          )
        })}

      {/* ── Interactive Point Hazard Markers with Tap Handler ── */}
      {hazards
        .filter((h) => !h.isRoadSegment)
        .map((h) => {
          const isSelected = selectedHazard?.id === h.id
          const isVerified = h.verified > 0 || h.status === 'Verified'

          return (
            <Marker key={h.id} longitude={h.lng} latitude={h.lat} anchor="center">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onHazardClick(h)
                }}
                className="group relative flex items-center justify-center cursor-pointer transition-all hover:scale-125 active:scale-95 focus:outline-none"
                style={{
                  width: h.severity === 'high' ? '40px' : h.severity === 'medium' ? '34px' : '28px',
                  height: h.severity === 'high' ? '40px' : h.severity === 'medium' ? '34px' : '28px',
                }}
                title={`Tap to view details: ${h.label}`}
              >
                {/* Pulsing ring for high severity */}
                {h.severity === 'high' && (
                  <div
                    className="absolute inset-0 rounded-full animate-ping opacity-75"
                    style={{ backgroundColor: SEVERITY_COLORS[h.severity] }}
                  />
                )}

                {/* Main Badge */}
                <div
                  className="relative inset-0 w-full h-full rounded-full border-2 border-white shadow-xl flex items-center justify-center transition-all"
                  style={{
                    backgroundColor: SEVERITY_COLORS[h.severity],
                    opacity: 1,
                    boxShadow: isSelected
                      ? '0 0 25px rgba(239, 68, 68, 1)'
                      : isVerified
                      ? '0 0 14px rgba(16, 185, 129, 0.8)'
                      : '0 4px 10px rgba(0,0,0,0.4)',
                  }}
                >
                  <span className="text-base select-none drop-shadow-sm">{h.emoji}</span>
                </div>

                {/* Verified Check Badge */}
                {isVerified && (
                  <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-white flex items-center justify-center text-[8px] text-white font-black shadow-sm">
                    ✓
                  </div>
                )}
              </button>
            </Marker>
          )
        })}

      {/* ── Evacuation Shelter Center Markers ── */}
      {showEvacCenters &&
        evacCenters.map((e, idx) => (
          <Marker key={`evac-marker-${idx}`} longitude={e.lng} latitude={e.lat} anchor="bottom">
            <div className="flex flex-col items-center group cursor-pointer">
              <div className="bg-slate-900 text-emerald-400 font-bold text-[9px] px-2 py-0.5 rounded-full shadow-lg border border-emerald-500/50 mb-0.5 whitespace-nowrap hidden group-hover:block">
                🏥 {e.name}
              </div>
              <div className="w-7 h-7 rounded-full bg-emerald-600 border-2 border-white flex items-center justify-center text-white text-xs font-bold shadow-xl transition-transform group-hover:scale-125">
                🏥
              </div>
            </div>
          </Marker>
        ))}

      {/* ── Interactive Info Popup Tooltip when Hazard Tapped ── */}
      {selectedHazard && (
        <Popup
          longitude={selectedHazard.lng}
          latitude={selectedHazard.lat}
          anchor="bottom"
          offset={26}
          closeButton={true}
          closeOnClick={false}
          onClose={() => onHazardClick(null as any)}
          className="z-30 rounded-2xl overflow-hidden shadow-2xl"
        >
          <div className="p-3 max-w-[240px] text-slate-900 bg-white font-sans">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-2xl">{selectedHazard.emoji}</span>
              <div>
                <div className="font-black text-sm leading-tight text-slate-900">{selectedHazard.label}</div>
                <div className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                  <span className="capitalize font-semibold">{selectedHazard.severity} Severity</span>
                  {selectedHazard.verified > 0 && <span className="text-emerald-600 font-bold">✓ Verified</span>}
                </div>
              </div>
            </div>
            <div className="text-xs text-slate-600 my-2 bg-slate-100 p-2 rounded-xl">
              Status: <span className="font-bold text-red-600">{selectedHazard.status}</span> · {selectedHazard.distance}
            </div>
            <button
              onClick={() => onHazardClick(selectedHazard)}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold py-2 rounded-xl transition-colors shadow-sm"
            >
              Open Full Report Sheet
            </button>
          </div>
        </Popup>
      )}
    </Map>
    </div>
  )
})

export default MapCanvas
