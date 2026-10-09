import * as turf from "@turf/turf";
import { Hazard, RoadSegment } from "../components/MapCanvas";
import { CitizenReport } from "../context/DisasterContext";

export interface HazardOnRouteEvaluation {
  isOnRoute: boolean;
  isAhead: boolean;
  shouldAlert: boolean;
  distanceAheadKm: number;
  distanceToRouteMeters: number;
  hazardPointOnRoute: [number, number]; // [lng, lat]
  affectedSegmentCoords: [number, number][]; // [lng, lat][]
  roadName: string;
  reason?: string;
}

/**
 * Checks if a point or road segment hazard lies within ~40m of the active route polyline,
 * is positioned ahead of the user's current progress along the route, and is within ~5km.
 *
 * @param routeCoords GeoJSON coordinate array [[lng, lat], ...] of the active route
 * @param userCoords Current driver coordinates { lat, lng }
 * @param hazard The hazard or citizen flood report to check
 * @param maxBufferMeters Maximum distance to route to consider on-route (default 40m)
 * @param maxDistanceAheadKm Maximum lookahead horizon (default 5.0km)
 */
export function evaluateHazardOnRoute(
  routeCoords: [number, number][],
  userCoords: { lat: number; lng: number },
  hazard: Hazard | CitizenReport,
  maxBufferMeters = 80,
  maxDistanceAheadKm = 5.0,
): HazardOnRouteEvaluation {
  const fallbackResult: HazardOnRouteEvaluation = {
    isOnRoute: false,
    isAhead: false,
    shouldAlert: false,
    distanceAheadKm: 0,
    distanceToRouteMeters: 9999,
    hazardPointOnRoute: [0, 0],
    affectedSegmentCoords: [],
    roadName: "",
  };

  if (!routeCoords || routeCoords.length < 2) {
    return fallbackResult;
  }

  // Check resolved/rejected status
  const statusStr = String((hazard as any).status || "").toLowerCase();
  if (statusStr.includes("resolved") || statusStr.includes("rejected")) {
    return { ...fallbackResult, reason: "Status is resolved or rejected" };
  }

  // Check if hazard is a flood / road blockage type
  const typeStr = String((hazard as any).type || "").toLowerCase();
  const isFloodOrClosure =
    typeStr.includes("flood") ||
    typeStr.includes("closure") ||
    typeStr.includes("road") ||
    typeStr.includes("rain") ||
    typeStr === "";

  if (!isFloodOrClosure) {
    // We prioritize flood / impassable hazards for route hazard alerts
    return { ...fallbackResult, reason: "Non-flood hazard type" };
  }

  let line: turf.helpers.Feature<turf.helpers.LineString>;
  try {
    line = turf.lineString(routeCoords);
  } catch {
    return fallbackResult;
  }

  // 1. Locate User on Line
  const userPt = turf.point([userCoords.lng, userCoords.lat]);
  let userSnap: turf.helpers.Feature<turf.helpers.Point, { location: number; index: number }>;
  try {
    userSnap = turf.nearestPointOnLine(line, userPt);
  } catch {
    return fallbackResult;
  }
  const userProgressKm = userSnap.properties?.location ?? 0;

  // 2. Identify Hazard Geographic Center & Road Name
  let hazLat = hazard.lat;
  let hazLng = hazard.lng;
  if (hazLat > 50 && hazLng < 50) {
    const tmp = hazLat;
    hazLat = hazLng;
    hazLng = tmp;
  }

  let roadName =
    (hazard as any).roadSegment?.roadName ||
    (hazard as any).locationName ||
    (hazard as any).label ||
    "Road Ahead";

  const roadSeg: RoadSegment | undefined = (hazard as any).roadSegment;
  let minDistanceToRouteKm = Infinity;
  let closestHazardPoint: [number, number] = [hazLng, hazLat];

  if (roadSeg && roadSeg.path && roadSeg.path.length > 1) {
    // Check all coordinates along the flooded road segment
    for (const rawPoint of roadSeg.path) {
      const p1 = rawPoint[0];
      const p2 = rawPoint[1];
      const sLng = p1 > 50 ? p1 : p2;
      const sLat = p1 > 50 ? p2 : p1;
      try {
        const segPt = turf.point([sLng, sLat]);
        const dKm = turf.pointToLineDistance(segPt, line, { units: "kilometers" });
        if (dKm < minDistanceToRouteKm) {
          minDistanceToRouteKm = dKm;
          closestHazardPoint = [sLng, sLat];
        }
      } catch {}
    }
  } else {
    // Single point report
    try {
      const hazPt = turf.point([hazLng, hazLat]);
      minDistanceToRouteKm = turf.pointToLineDistance(hazPt, line, { units: "kilometers" });
      closestHazardPoint = [hazLng, hazLat];
    } catch {
      return fallbackResult;
    }
  }

  const distanceToRouteMeters = minDistanceToRouteKm * 1000;
  const isOnRoute = distanceToRouteMeters <= maxBufferMeters;

  // 3. Check if Hazard is Ahead of User along Route Trajectory
  const hazPointOnLine = turf.nearestPointOnLine(line, turf.point(closestHazardPoint));
  const hazardProgressKm = hazPointOnLine.properties?.location ?? 0;
  const distanceAheadKm = hazardProgressKm - userProgressKm;

  // At least 15m ahead of current GPS position (to avoid false alarms behind vehicle), and within 5km
  const isAhead = distanceAheadKm >= 0.015 && distanceAheadKm <= maxDistanceAheadKm;

  // 4. Extract Affected Segment on Route (e.g. 100m window around hazard point)
  let affectedSegmentCoords: [number, number][] = [];
  if (isOnRoute) {
    try {
      const startLoc = Math.max(0, hazardProgressKm - 0.12);
      const endLoc = Math.min(turf.length(line, { units: "kilometers" }), hazardProgressKm + 0.12);
      const sliced = turf.lineSliceAlong(line, startLoc, endLoc, { units: "kilometers" });
      if (sliced && sliced.geometry?.coordinates?.length > 1) {
        affectedSegmentCoords = sliced.geometry.coordinates as [number, number][];
      }
    } catch {
      // Fallback: segment around nearest point
      affectedSegmentCoords = [
        [closestHazardPoint[0] - 0.001, closestHazardPoint[1] - 0.001],
        closestHazardPoint,
        [closestHazardPoint[0] + 0.001, closestHazardPoint[1] + 0.001],
      ];
    }
  }

  const shouldAlert = isOnRoute && isAhead;

  return {
    isOnRoute,
    isAhead,
    shouldAlert,
    distanceAheadKm: Math.max(0, distanceAheadKm),
    distanceToRouteMeters: Math.round(distanceToRouteMeters),
    hazardPointOnRoute:
      (hazPointOnLine.geometry.coordinates as [number, number]) || closestHazardPoint,
    affectedSegmentCoords,
    roadName,
  };
}

/**
 * Formats a distance in kilometers into user-friendly localized text
 */
export function formatHazardDistance(distKm: number): string {
  if (distKm < 1) {
    return `${Math.round(distKm * 1000)} m`;
  }
  return `${distKm.toFixed(1)} km`;
}
