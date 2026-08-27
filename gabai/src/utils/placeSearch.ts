/**
 * Searches real-world locations, hospitals, parks, and evacuation destinations via OpenStreetMap Nominatim
 */
export async function searchRealWorldPlaces(
  query: string,
  nearLat?: number,
  nearLng?: number
): Promise<Array<{ name: string; address: string; lat: number; lng: number; type: string }>> {
  if (!query || query.trim().length < 2) return []

  const cleanQuery = query.trim().replace(/[,\.\?!]+$/, '')
  const queriesToTry = [
    `${cleanQuery}, Pampanga`,
    `${cleanQuery}, Philippines`,
    cleanQuery,
  ]

  for (const q of queriesToTry) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 3500)

      let url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        q
      )}&countrycodes=ph&limit=8&addressdetails=1`

      if (nearLat && nearLng) {
        const delta = 1.2
        url += `&viewbox=${nearLng - delta},${nearLat + delta},${nearLng + delta},${nearLat - delta}`
      }

      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'Accept-Language': 'en,fil' },
      })
      clearTimeout(timeoutId)

      if (!res.ok) continue
      const data = await res.json()

      if (Array.isArray(data) && data.length > 0) {
        return data.map((item: any) => ({
          name: item.display_name.split(',')[0],
          address: item.display_name,
          lat: parseFloat(item.lat),
          lng: parseFloat(item.lon),
          type: item.type || 'place',
        }))
      }
    } catch {
      // Continue to next query attempt
    }
  }

  return []
}

