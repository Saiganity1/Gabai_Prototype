/**
 * Searches real-world locations, hospitals, and evacuation destinations via OpenStreetMap Nominatim
 */
export async function searchRealWorldPlaces(
  query: string,
  nearLat?: number,
  nearLng?: number
): Promise<Array<{ name: string; address: string; lat: number; lng: number; type: string }>> {
  if (!query || query.trim().length < 2) return []

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 4000)

    let url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      query
    )}&countrycodes=ph&limit=10&addressdetails=1`

    if (nearLat && nearLng) {
      const delta = 0.8
      url += `&viewbox=${nearLng - delta},${nearLat + delta},${nearLng + delta},${nearLat - delta}`
    }

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept-Language': 'en,fil' },
    })
    clearTimeout(timeoutId)

    if (!res.ok) return []
    const data = await res.json()

    return data.map((item: any) => ({
      name: item.display_name.split(',')[0],
      address: item.display_name,
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      type: item.type || 'place',
    }))
  } catch {
    return []
  }
}
