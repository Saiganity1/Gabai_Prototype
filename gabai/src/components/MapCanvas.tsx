import { useRef, useEffect, useMemo, useImperativeHandle, forwardRef } from 'react'
import Map, { Source, Layer, Marker, Popup, NavigationControl } from 'react-map-gl/maplibre'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { UserCoordinates } from '../hooks/useUserLocation'
import { RouteInfo } from '../utils/routingEngine'
import { Establishment, CATEGORY_CONFIG } from '../utils/establishmentImporter'

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
}

export interface MapCanvasHandle {
  flyToUser: () => void
  flyToCoords: (lat: number, lng: number, zoom?: number) => void
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
  establishments?: Establishment[]
  selectedEstablishment?: Establishment | null
  onEstablishmentClick?: (e: Establishment) => void
  showEstablishments?: boolean
  routes?: Record<'safe' | 'balanced' | 'fast', RouteInfo>
  destination?: { name: string; lat: number; lng: number } | null
  onMapClick?: (coords: { lat: number; lng: number }) => void
  flyToTrigger?: number
  showRadar?: boolean
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
    establishments = [],
    selectedEstablishment,
    onEstablishmentClick = () => {},
    showEstablishments = false,
    routes,
    destination,
    onMapClick,
    flyToTrigger,
    showRadar = true,
  },
  ref
) {
  const mapRef = useRef<any>(null)
  const initialCentered = useRef(false)

  const lightStyle: any = {
    version: 8,
    sources: {
      'osm-standard': {
        type: 'raster',
        tiles: [
          'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        ],
        tileSize: 256,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      },
    },
    layers: [
      {
        id: 'osm-standard-layer',
        type: 'raster',
        source: 'osm-standard',
        minzoom: 0,
        maxzoom: 19,
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
        ],
        tileSize: 256,
        attribution: '&copy; CARTO &copy; OpenStreetMap',
      },
    },
    layers: [
      {
        id: 'carto-dark-layer',
        type: 'raster',
        source: 'carto-dark',
        minzoom: 0,
        maxzoom: 20,
      },
    ],
  }

  const userLat = userLocation.lat
  const userLng = userLocation.lng

  const flyToUser = () => {
    if (mapRef.current) {
      mapRef.current.flyTo({
        center: [userLng, userLat],
        zoom: 15,
        pitch: 60,
        bearing: 0,
        duration: 1600,
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
        pitch: 60,
        duration: 1600,
        essential: true,
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

  // Accurate Geodesic Danger Zones for all active hazards
  const hazardZonesGeoJSON = useMemo(() => {
    return {
      type: 'FeatureCollection' as const,
      features: hazards
        .filter((h) => h.status !== 'Resolved')
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
        // Heavy rain cell
        {
          ...createGeoCircle([userLng - 0.018, userLat + 0.015], 1800),
          properties: { color: '#EF4444', intensity: 'Heavy Precipitation (35mm/hr)' },
        },
        // Moderate rain band
        {
          ...createGeoCircle([userLng + 0.022, userLat - 0.012], 2400),
          properties: { color: '#F59E0B', intensity: 'Moderate Rain (15mm/hr)' },
        },
        // Broad light rain perimeter
        {
          ...createGeoCircle([userLng, userLat], 3200),
          properties: { color: '#10B981', intensity: 'Scattered Showers' },
        },
      ],
    }
  }, [showRadar, userLng, userLat])

  return (
    <Map
      ref={mapRef}
      mapLib={maplibregl}
      initialViewState={{
        longitude: userLng,
        latitude: userLat,
        zoom: 14,
        pitch: 60,
        bearing: 0,
      }}
      style={{ width: '100%', height: '100%' }}
      mapStyle={darkMode ? darkStyle : lightStyle}
      maxBounds={[[114.0, 4.0], [127.0, 22.0]]}
      minZoom={5}
      onClick={(e) => {
        if (onMapClick && e.lngLat) {
          onMapClick({ lat: e.lngLat.lat, lng: e.lngLat.lng })
        }
      }}
    >
      <NavigationControl position={navPosition} />

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

      {/* ── Real Imported Map Establishments & POIs Layer ── */}
      {showEstablishments &&
        establishments.map((est) => {
          const config = CATEGORY_CONFIG[est.category] || CATEGORY_CONFIG.government
          const isSelected = selectedEstablishment?.id === est.id

          return (
            <Marker key={est.id} longitude={est.lng} latitude={est.lat} anchor="bottom">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onEstablishmentClick(est)
                }}
                className="group relative flex flex-col items-center cursor-pointer transition-all hover:scale-125 active:scale-95 focus:outline-none z-20"
                title={`${est.name} (${est.categoryLabel}) - ${est.distance}`}
              >
                {/* Pin Badge */}
                <div
                  className="relative w-8 h-8 rounded-full border-2 border-white shadow-xl flex items-center justify-center transition-transform"
                  style={{
                    backgroundColor: config.color,
                    boxShadow: isSelected
                      ? `0 0 24px ${config.color}, 0 4px 12px rgba(0,0,0,0.5)`
                      : '0 3px 10px rgba(0,0,0,0.4)',
                    transform: isSelected ? 'scale(1.25)' : 'scale(1)',
                  }}
                >
                  <span className="text-sm select-none drop-shadow">{est.emoji}</span>
                </div>
                {/* Pin Pointer Tail */}
                <div
                  className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-t-[5px] -mt-0.5"
                  style={{ borderTopColor: config.color }}
                />

                {/* Subtitle Badge on Hover */}
                <div className="hidden group-hover:flex absolute -bottom-6 bg-slate-900/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-md whitespace-nowrap shadow-lg backdrop-blur-sm pointer-events-none z-30">
                  {est.name}
                </div>
              </button>
            </Marker>
          )
        })}

      {/* ── Interactive Hazard Markers with Tap Handler ── */}
      {hazards.map((h) => {
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

      {/* ── Interactive Info Popup Tooltip when Establishment Tapped ── */}
      {selectedEstablishment && (
        <Popup
          longitude={selectedEstablishment.lng}
          latitude={selectedEstablishment.lat}
          anchor="bottom"
          offset={22}
          closeButton={true}
          closeOnClick={false}
          onClose={() => onEstablishmentClick(null as any)}
          className="z-30 rounded-2xl overflow-hidden shadow-2xl"
        >
          <div className="p-3 max-w-[260px] text-slate-900 bg-white font-sans">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-2xl">{selectedEstablishment.emoji}</span>
              <div>
                <div className="font-black text-sm leading-tight text-slate-900 line-clamp-2">
                  {selectedEstablishment.name}
                </div>
                <div className="text-[10px] text-slate-500 font-medium mt-0.5">
                  {selectedEstablishment.categoryLabel}
                </div>
              </div>
            </div>
            <div className="text-[11px] text-slate-600 my-2 bg-slate-100 p-2 rounded-xl">
              <div>📍 {selectedEstablishment.address}</div>
              <div className="mt-1 font-semibold text-emerald-600">{selectedEstablishment.status}</div>
            </div>
            <button
              onClick={() => onEstablishmentClick(selectedEstablishment)}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-2 rounded-xl transition-colors shadow-sm"
            >
              Navigate Safe Route Here
            </button>
          </div>
        </Popup>
      )}
    </Map>
  )
})

export default MapCanvas
