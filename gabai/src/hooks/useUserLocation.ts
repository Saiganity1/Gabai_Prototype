import { useState, useEffect, useCallback, useRef } from 'react'

export interface UserCoordinates {
  lat: number
  lng: number
  accuracy?: number
  heading?: number | null
  speed?: number | null
}

export interface UserLocationState {
  coords: UserCoordinates
  locationName: string
  isLoading: boolean
  isLive: boolean
  error: string | null
}

// Fallback default coordinates (Manila - Original Prototype)
export const DEFAULT_LOCATION: UserCoordinates = {
  lat: 14.5995,
  lng: 120.9842,
  accuracy: 35,
}

export function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371 // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

export function formatDistance(distKm: number): string {
  if (distKm < 1) {
    return `${Math.round(distKm * 1000)} m`
  }
  return `${distKm.toFixed(1)} km`
}

export function useUserLocation() {
  const [location, setLocation] = useState<UserLocationState>({
    coords: DEFAULT_LOCATION,
    locationName: 'Tondo, Manila',
    isLoading: false,
    isLive: false,
    error: null,
  })

  const watchIdRef = useRef<number | null>(null)
  const lastGeocodeCoords = useRef<{ lat: number; lng: number } | null>(null)
  const isAcquiredRef = useRef(false)

  // Reverse geocode latitude and longitude into human-friendly location name
  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    if (lastGeocodeCoords.current) {
      const movedKm = calculateDistanceKm(
        lastGeocodeCoords.current.lat,
        lastGeocodeCoords.current.lng,
        lat,
        lng
      )
      if (movedKm < 0.1) return
    }

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 4000)

      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`,
        {
          signal: controller.signal,
          headers: {
            'Accept-Language': 'en,fil',
          },
        }
      )
      clearTimeout(timeoutId)

      if (response.ok) {
        const data = await response.json()
        const addr = data.address || {}
        const area =
          addr.suburb ||
          addr.neighbourhood ||
          addr.village ||
          addr.quarter ||
          addr.district ||
          addr.city_district ||
          addr.town ||
          addr.city ||
          ''
        const city = addr.city || addr.municipality || addr.state || addr.province || 'Pampanga'

        let name = ''
        if (area && city && area !== city) {
          name = `${area}, ${city}`
        } else if (area || city) {
          name = area || city
        } else {
          name = data.display_name?.split(',').slice(0, 2).join(',') || `${lat.toFixed(4)}°, ${lng.toFixed(4)}°`
        }

        lastGeocodeCoords.current = { lat, lng }
        setLocation(prev => ({ ...prev, locationName: name }))
      }
    } catch {
      setLocation(prev => ({
        ...prev,
        locationName: prev.locationName === 'Detecting location...' 
          ? `${lat.toFixed(4)}°, ${lng.toFixed(4)}°` 
          : prev.locationName,
      }))
    }
  }, [])

  // Handle successful position acquisition
  const handlePositionSuccess = useCallback((position: GeolocationPosition) => {
    isAcquiredRef.current = true
    const { latitude, longitude, accuracy, heading, speed } = position.coords
    const newCoords: UserCoordinates = {
      lat: latitude,
      lng: longitude,
      accuracy: accuracy || 20,
      heading,
      speed,
    }

    setLocation(prev => ({
      ...prev,
      coords: newCoords,
      isLoading: false,
      isLive: true,
      error: null,
    }))

    reverseGeocode(latitude, longitude)
  }, [reverseGeocode])

  // IP fallback if browser GPS times out or is blocked
  const tryIpFallback = useCallback(async () => {
    if (isAcquiredRef.current) return
    try {
      const res = await fetch('https://ipapi.co/json/')
      if (res.ok) {
        const data = await res.json()
        if (data.latitude && data.longitude && !isAcquiredRef.current) {
          const lat = parseFloat(data.latitude)
          const lng = parseFloat(data.longitude)
          const name = [data.city, data.region].filter(Boolean).join(', ') || 'Pampanga'
          setLocation(prev => ({
            ...prev,
            coords: { lat, lng, accuracy: 300 },
            locationName: name,
            isLoading: false,
            isLive: true,
            error: null,
          }))
          return
        }
      }
    } catch {
      // Ignore IP fallback errors
    }

    // Final fallback to Pampanga center
    if (!isAcquiredRef.current) {
      setLocation(prev => ({
        ...prev,
        isLoading: false,
        locationName: 'Pampanga, Central Luzon',
      }))
    }
  }, [])

  // Handle geolocation errors with low-accuracy fallback
  const handlePositionError = useCallback((err: GeolocationPositionError) => {
    if (err.code === err.TIMEOUT && !isAcquiredRef.current) {
      navigator.geolocation.getCurrentPosition(
        handlePositionSuccess,
        () => {
          tryIpFallback()
        },
        {
          enableHighAccuracy: false,
          timeout: 6000,
          maximumAge: 60000,
        }
      )
      return
    }

    tryIpFallback()
  }, [handlePositionSuccess, tryIpFallback])

  // Manual trigger to request / re-center location
  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      tryIpFallback()
      return
    }

    setLocation(prev => ({ ...prev, isLoading: true }))

    navigator.geolocation.getCurrentPosition(
      handlePositionSuccess,
      handlePositionError,
      {
        enableHighAccuracy: true,
        timeout: 7000,
        maximumAge: 10000,
      }
    )
  }, [handlePositionSuccess, handlePositionError, tryIpFallback])

  // Initialize continuous tracking on mount
  useEffect(() => {
    if (!navigator.geolocation) {
      tryIpFallback()
      return
    }

    navigator.geolocation.getCurrentPosition(
      handlePositionSuccess,
      handlePositionError,
      {
        enableHighAccuracy: true,
        timeout: 6000,
        maximumAge: 30000,
      }
    )

    try {
      watchIdRef.current = navigator.geolocation.watchPosition(
        handlePositionSuccess,
        () => {},
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 10000,
        }
      )
    } catch {
      // Ignore watchPosition errors
    }

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
    }
  }, [handlePositionSuccess, handlePositionError, tryIpFallback])

  return {
    ...location,
    requestLocation,
  }
}
