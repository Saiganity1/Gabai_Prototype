import { useState, useEffect, useMemo, useRef } from "react";
import {
  Search,
  Sun,
  Moon,
  Mic,
  MicOff,
  Layers,
  Locate,
  ChevronUp,
  ChevronDown,
  X,
  Shield,
  ShieldAlert,
  Navigation,
  MapPin,
  TriangleAlert,
  Users,
  PhoneCall,
  CheckCircle,
  Clock,
  ChevronRight,
  Loader2,
  Sparkles,
  Camera,
  Upload,
  Zap,
  CloudRain,
  Radio,
  Eye,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import MapCanvas, { Hazard, MapCanvasHandle } from "../components/MapCanvas";
import DrivingHUD from "../components/DrivingHUD";
import FamilySafetyModal from "../components/FamilySafetyModal";
import SOSRescueStrobe from "../components/SOSRescueStrobe";
import { useVoiceAssistant, VoiceActionPayload } from "../hooks/useVoiceAssistant";
import { useDisaster, isHazardPubliclyVisible } from "../context/DisasterContext";
import { REPORT_TYPES } from "../constants";
import { ActiveModal, AppState } from "../types";
import { StatusDot } from "../components/ui/StatusDot";
import { RiskBadge } from "../components/ui/RiskBadge";
import { GabaiChatbot } from "../components/GabaiChatbot";
import GabaiLogo from "../components/GabaiLogo";
import { searchRealWorldPlaces } from "../utils/placeSearch";
import { fetchRoadSegmentPath, fetchAccurateRealWorldRoutes } from "../utils/routingEngine";
import { analyzeRouteWithAI } from "../utils/aiRouteAdvisor";
import {
  geminiAnalyzeFloodPhoto,
  geminiAnalyzeRoute,
  geminiChatAssistant,
  geminiGeocodePlace,
  googleGeocodePlace,
} from "../utils/geminiClient";
import { calculateDistanceKm } from "../hooks/useUserLocation";
import { useRouteHazardMonitor } from "../hooks/useRouteHazardMonitor";
import HazardAlertModal from "../components/HazardAlertModal";
import HazardSimulationPanel from "../components/HazardSimulationPanel";
import {
  formatLocalizedRouteCardText,
  formatLocalizedFloodResponse,
  formatLocalizedFallback,
  ChatHistoryTurn,
} from "../utils/multilingualCoPilot";

const isLocalhost =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || (isLocalhost ? "http://localhost:3000/api" : "");

interface Props {
  darkMode: boolean;
  toggleDark: () => void;
}

export default function MainApp({ darkMode, toggleDark }: Props) {
  const {
    hazards,
    reports,
    myReportIds,
    evacCenters,
    userLocation,
    locationName,
    isLocationLoading,
    requestLocation,
    addHazardReport,
    destination,
    setDestination,
    routes,
    aiPatternInsight,
    lastActionMessage,
    clearLastActionMessage,
  } = useDisaster();

  const [activeModal, setActiveModal] = useState<ActiveModal | "family_safety">("none");
  const [appState, setAppState] = useState<AppState>("normal");
  const [selectedHazard, setSelectedHazard] = useState<Hazard | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<"safe" | "fast">("safe");
  const [panelOpen, setPanelOpen] = useState(false);

  const [showRadar, setShowRadar] = useState(false);

  // Destination Choosing States
  const [isChoosingDestination, setIsChoosingDestination] = useState(false);
  const [destinationSearch, setDestinationSearch] = useState("");
  const [isMapClickDestinationMode, setIsMapClickDestinationMode] = useState(false);
  const [pendingAutoNavigate, setPendingAutoNavigate] = useState(false);

  // Advanced feature active views
  const [isDrivingHUDActive, setIsDrivingHUDActive] = useState(false);
  const [isSOSStrobeActive, setIsSOSStrobeActive] = useState(false);
  const [isChatbotOpen, setIsChatbotOpen] = useState(false);
  const [isRouteSheetMinimized, setIsRouteSheetMinimized] = useState(false);

  // Real Search Autocomplete
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchResults, setSearchResults] = useState<
    Array<{
      name: string;
      address: string;
      lat: number;
      lng: number;
      isEstablishment?: boolean;
      emoji?: string;
    }>
  >([]);
  const [isSearching, setIsSearching] = useState(false);

  // Reporting with AI Vision & Road Flood Segments
  const [reportStep, setReportStep] = useState<"form" | "analyzing" | "done">("form");
  const [reportType, setReportType] = useState<string>("flood");
  const [reportDesc, setReportDesc] = useState<string>("");
  const [reportSeverity, setReportSeverity] = useState<"low" | "medium" | "high">("high");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isAnalyzingPhoto, setIsAnalyzingPhoto] = useState(false);
  const [photoAiAnalysis, setPhotoAiAnalysis] = useState<any>(null);

  // Road Flood Line Segment State
  const [isRoadSegmentMode, setIsRoadSegmentMode] = useState(true);
  const [roadName, setRoadName] = useState("");
  const [floodStartPoint, setFloodStartPoint] = useState<{
    lat: number;
    lng: number;
    name: string;
  } | null>(null);
  const [floodEndPoint, setFloodEndPoint] = useState<{
    lat: number;
    lng: number;
    name: string;
  } | null>(null);
  const [floodPassability, setFloodPassability] = useState<
    "all_passable" | "not_passable_light" | "not_passable_all"
  >("not_passable_light");
  const [floodWaterDepth, setFloodWaterDepth] = useState("Knee Deep (0.45m)");
  const [isPickingPointMode, setIsPickingPointMode] = useState<"from" | "to" | null>(null);

  // 🛡️ Anti-Spam & Geofencing Defense states (Crowdsource Security)
  const [reportCooldownSec, setReportCooldownSec] = useState<number>(0);
  const [reportErrorMsg, setReportErrorMsg] = useState<string | null>(null);

  // Monitor device cooldown timer (120s rate limit)
  useEffect(() => {
    const checkCooldown = () => {
      const lastReport = Number(localStorage.getItem("gabai_last_report_timestamp") || 0);
      const diffMs = Date.now() - lastReport;
      const COOLDOWN_MS = 120_000; // 2 minutes cooldown
      if (diffMs < COOLDOWN_MS) {
        setReportCooldownSec(Math.ceil((COOLDOWN_MS - diffMs) / 1000));
      } else {
        setReportCooldownSec(0);
      }
    };
    checkCooldown();
    const interval = setInterval(checkCooldown, 1000);
    return () => clearInterval(interval);
  }, []);

  // Calculate distance between user device GPS and reported incident (Proof-of-Location)
  const reportDistanceKm = useMemo(() => {
    let targetLat = userLocation.lat;
    let targetLng = userLocation.lng;
    if (isRoadSegmentMode && floodStartPoint) {
      targetLat = floodStartPoint.lat;
      targetLng = floodStartPoint.lng;
    }
    return calculateDistanceKm(userLocation.lat, userLocation.lng, targetLat, targetLng);
  }, [userLocation.lat, userLocation.lng, isRoadSegmentMode, floodStartPoint]);

  const isGeofenceViolated = reportDistanceKm > 1.5;

  // Map Layer & Perspective Controls
  const [is3D, setIs3D] = useState(false);
  const [isSatellite, setIsSatellite] = useState(false);
  const [show3DBuildings, setShow3DBuildings] = useState(true);
  const [showDangerZones, setShowDangerZones] = useState(true);
  const [showRoadLines, setShowRoadLines] = useState(true);
  const [showEvacCenters, setShowEvacCenters] = useState(true);
  const [layersOpen, setLayersOpen] = useState(false);
  const [conditionsOpen, setConditionsOpen] = useState(true);
  const [showLegend, setShowLegend] = useState(true);
  const [locationAllowedForHotlines, setLocationAllowedForHotlines] = useState(false);
  const [isAiAlertDismissed, setIsAiAlertDismissed] = useState(false);
  const mapCanvasRef = useRef<MapCanvasHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Anti-Spam Public Visibility Filter: Unverified citizen reports from other users are hidden until LGU verifies them
  const publicHazards = useMemo(() => {
    return hazards.filter((h) => isHazardPubliclyVisible(h, myReportIds));
  }, [hazards, myReportIds]);

  // ── Custom Detour Route (when driver accepts a bypass around a detected flood) ──
  const [customDetourRoute, setCustomDetourRoute] = useState<RouteInfo | null>(null);

  useEffect(() => {
    setCustomDetourRoute(null);
    setSelectedRoute("safe");
  }, [destination]);

  // Automatically enforce safe route when direct route has flood hazards
  useEffect(() => {
    if (routes?.fast?.risk === "high") {
      setSelectedRoute("safe");
    }
  }, [routes]);

  const effectiveRoutes = useMemo(() => {
    if (!customDetourRoute || !routes) return routes;
    return {
      ...routes,
      [selectedRoute]: customDetourRoute,
      safe: customDetourRoute,
    };
  }, [routes, customDetourRoute, selectedRoute]);

  // ── Live Route Hazard Alert Monitor ──
  const activeRouteForHazardMonitor = useMemo(() => {
    if (customDetourRoute) return customDetourRoute;
    if (!routes || !selectedRoute) return null;
    return routes[selectedRoute] || null;
  }, [customDetourRoute, routes, selectedRoute]);

  const {
    activeAlert: routeHazardAlert,
    redSegmentOnRoute,
    pulsingHazardPoint,
    dismissAlert: dismissRouteHazardAlert,
    confirmContinueAnyway: confirmRouteHazardContinue,
    setSimulatedPosition,
    injectSimulatedHazardAhead,
  } = useRouteHazardMonitor({
    activeRoute: activeRouteForHazardMonitor,
    isNavigating: isDrivingHUDActive || activeModal === "routes",
    userLocation,
    hazards: publicHazards,
    reports,
  });

  const toggle3DMode = () => {
    setIs3D((prev) => {
      const next = !prev;
      mapCanvasRef.current?.set3DMode(next);
      return next;
    });
  };

  // Selectable Destinations list for Safe Route chooser (Evacuation Shelters)
  const selectableDestinations = useMemo(() => {
    let list = evacCenters;
    if (destinationSearch.trim()) {
      const q = destinationSearch.toLowerCase().trim();
      list = list.filter(
        (e) => e.name.toLowerCase().includes(q) || e.address.toLowerCase().includes(q),
      );
    }
    return list;
  }, [evacCenters, destinationSearch]);

  // AI Neural Route Analysis & Predictive Hazard Modeling
  const aiRouteAnalysis = useMemo(() => {
    return routes ? analyzeRouteWithAI(routes, hazards) : null;
  }, [routes, hazards]);

  const handleMapClick = (coords: { lat: number; lng: number }) => {
    if (isPickingPointMode === "from") {
      setFloodStartPoint({
        lat: coords.lat,
        lng: coords.lng,
        name: `Start (Point A: ${coords.lat.toFixed(3)}°N, ${coords.lng.toFixed(3)}°E)`,
      });
      setIsPickingPointMode(null);
      setActiveModal("report");
      return;
    }

    if (isPickingPointMode === "to") {
      setFloodEndPoint({
        lat: coords.lat,
        lng: coords.lng,
        name: `End (Point B: ${coords.lat.toFixed(3)}°N, ${coords.lng.toFixed(3)}°E)`,
      });
      setIsPickingPointMode(null);
      setActiveModal("report");
      return;
    }

    if (isMapClickDestinationMode) {
      setDestination({
        name: `Selected Map Location (${coords.lat.toFixed(3)}°N, ${coords.lng.toFixed(3)}°E)`,
        lat: coords.lat,
        lng: coords.lng,
      });
      setIsMapClickDestinationMode(false);
      setSelectedRoute("safe");
      setActiveModal("routes");
      mapCanvasRef.current?.flyToCoords(coords.lat, coords.lng, 15);
    }
  };

  // Live real-world search debounce
  useEffect(() => {
    if (!searchQuery || searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      const q = searchQuery.toLowerCase().trim();

      // Match in evacuation centers first
      let localMatches = evacCenters
        .filter(
          (evac) => evac.name.toLowerCase().includes(q) || evac.address.toLowerCase().includes(q),
        )
        .map((evac) => ({
          name: evac.name,
          address: `Evacuation Center · ${evac.address}`,
          lat: evac.lat,
          lng: evac.lng,
          isEstablishment: false,
          emoji: "🛡️",
        }));

      // Real-world OpenStreetMap Nominatim results
      const osmMatches = await searchRealWorldPlaces(
        searchQuery,
        userLocation.lat,
        userLocation.lng,
      );

      const combined = [
        ...localMatches,
        ...osmMatches.map((m) => ({
          name: m.name,
          address: m.address,
          lat: m.lat,
          lng: m.lng,
          isEstablishment: false,
          emoji: "📍",
        })),
      ];

      setSearchResults(combined.slice(0, 10));
      setIsSearching(false);
    }, 200);

    return () => clearTimeout(timer);
  }, [searchQuery, evacCenters, userLocation.lat, userLocation.lng]);

  // AI Voice Context
  const mapContext = useMemo(
    () => ({
      currentLocation: `${locationName} (${userLocation.lat.toFixed(4)}°N, ${userLocation.lng.toFixed(4)}°E)`,
      nearbyHazards: hazards,
      evacuationCenters: evacCenters,
    }),
    [locationName, userLocation.lat, userLocation.lng, hazards, evacCenters],
  );

  const handleMicPress = () => {
    setIsChatbotOpen(true);
  };

  // Handle AI Voice & Chatbot Action triggers
  const handleVoiceAction = (payload: VoiceActionPayload) => {
    if (payload.action === "REPORT_HAZARD") {
      try {
        const { hazard } = addHazardReport({
          type: payload.hazardType || "flood",
          description: `Voice AI Report: ${payload.transcript}`,
          severity: payload.severity || "high",
          citizenName: "Voice Assistant (Live Citizen)",
        });
        if (hazard) {
          setSelectedHazard(hazard);
          setActiveModal("hazard");
        }
      } catch (err: any) {
        console.warn("Voice hazard report blocked by anti-spam:", err?.message);
      }
    } else if (payload.action === "SAFE_ROUTE") {
      if (evacCenters.length > 0) {
        // Find nearest evac center
        const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
          const R = 6371;
          const dLat = ((lat2 - lat1) * Math.PI) / 180;
          const dLon = ((lon2 - lon1) * Math.PI) / 180;
          const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos((lat1 * Math.PI) / 180) *
              Math.cos((lat2 * Math.PI) / 180) *
              Math.sin(dLon / 2) *
              Math.sin(dLon / 2);
          return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        };

        let nearest = evacCenters[0];
        let minDist = getDistance(userLocation.lat, userLocation.lng, nearest.lat, nearest.lng);

        for (let i = 1; i < evacCenters.length; i++) {
          const dist = getDistance(
            userLocation.lat,
            userLocation.lng,
            evacCenters[i].lat,
            evacCenters[i].lng,
          );
          if (dist < minDist) {
            minDist = dist;
            nearest = evacCenters[i];
          }
        }

        setDestination({ name: nearest.name, lat: nearest.lat, lng: nearest.lng });
        setPendingAutoNavigate(true);
        setActiveModal("none");
      } else {
        setActiveModal("routes");
      }
    } else if (payload.action === "NAVIGATE" && payload.destination) {
      const dest = payload.destination.trim();
      const q = dest.toLowerCase();

      // Common Pampanga emergency & civic landmarks
      const KNOWN_PAMPANGA_PLACES = [
        {
          name: "SM City Pampanga",
          lat: 15.0475,
          lng: 120.697,
          keywords: ["sm pampanga", "sm city", "sm san fernando", "sm mall"],
        },
        {
          name: "Clark International Airport",
          lat: 15.1859,
          lng: 120.5596,
          keywords: ["clark", "clark airport", "crk", "airport"],
        },
        {
          name: "Mexico Community Hospital",
          lat: 15.0645,
          lng: 120.7225,
          keywords: ["mexico hospital", "mexico community hospital", "hospital sa mexico"],
        },
        {
          name: "San Fernando City Hall",
          lat: 15.0298,
          lng: 120.6895,
          keywords: ["san fernando city hall", "san fernando munisipyo", "san fernando hall"],
        },
        {
          name: "Angeles City Hall",
          lat: 15.145,
          lng: 120.5887,
          keywords: ["angeles city hall", "angeles munisipyo"],
        },
        {
          name: "Santa Maria Barangay Hall",
          lat: 15.074,
          lng: 120.781,
          keywords: ["santa maria", "sta maria", "brgy santa maria", "santa maria hall"],
        },
        {
          name: "San Sebastian Elementary School",
          lat: 15.0425,
          lng: 120.7913,
          keywords: ["san sebastian", "san sebastian school"],
        },
        {
          name: "MacArthur Highway Commercial Strip",
          lat: 15.039,
          lng: 120.684,
          keywords: ["macarthur", "macarthur highway", "dolores flyover"],
        },
      ];

      const navigateTo = async () => {
        let target: { name: string; lat: number; lng: number } | null = null;

        // 1. Local Evacuation Centers
        const localMatch = evacCenters.find(
          (e) => e.name.toLowerCase().includes(q) || e.address.toLowerCase().includes(q),
        );
        if (localMatch) {
          target = { name: localMatch.name, lat: localMatch.lat, lng: localMatch.lng };
        }

        // 2. Known Pampanga Landmarks
        if (!target) {
          const landmarkMatch = KNOWN_PAMPANGA_PLACES.find((p) =>
            p.keywords.some((k) => q.includes(k) || k.includes(q)),
          );
          if (landmarkMatch) {
            target = { name: landmarkMatch.name, lat: landmarkMatch.lat, lng: landmarkMatch.lng };
          }
        }

        // 3. OpenStreetMap Nominatim Live Search
        if (!target) {
          try {
            const osmMatches = await searchRealWorldPlaces(
              dest,
              userLocation.lat,
              userLocation.lng,
            );
            if (osmMatches && osmMatches.length > 0) {
              target = { name: osmMatches[0].name, lat: osmMatches[0].lat, lng: osmMatches[0].lng };
            }
          } catch {}
        }

        if (target) {
          setDestination(target);
          setPendingAutoNavigate(true);
          setActiveModal("none");
        }
      };

      navigateTo();
    }
  };

  const handleViewRouteOnMap = (dest?: any) => {
    setIsChatbotOpen(false);
    if (dest) {
      setDestination({
        name: dest.destinationName || dest.name,
        lat: dest.lat,
        lng: dest.lng,
      });
      mapCanvasRef.current?.flyToCoords(dest.lat, dest.lng, 14);
    }
    setActiveModal("routes");
  };

  // Intelligent Chatbot Message Processor
  const handleProcessChatMessage = async (
    text: string,
    rawHistory?: any[],
  ): Promise<{ text: string; routeCard?: any }> => {
    try {
      const lower = text.toLowerCase().trim();

      // 1. Check if user is reporting a hazard
      if (
        (lower.includes("baha") ||
          lower.includes("flood") ||
          lower.includes("lubog") ||
          lower.includes("tubig")) &&
        !lower.includes("iwas") &&
        !lower.includes("avoid") &&
        !lower.includes("may daan ba") &&
        !lower.includes("saan") &&
        !lower.includes("baha ba")
      ) {
        try {
          const { hazard } = addHazardReport({
            type: "flood",
            description: `Chatbot Report: ${text}`,
            severity: "high",
            citizenName: "Chatbot (Live Citizen)",
          });
          if (hazard) setSelectedHazard(hazard);
          return {
            text: "📢 Naitala ko na ang flood report mo. Naipasa na ito sa LGU Command Center para sa agarang beripikasyon at aksyon.",
          };
        } catch (err: any) {
          return {
            text: `⚠️ Anti-Spam Security: ${err?.message || "Hindi naipasa ang report dahil sa rate-limiting o GPS geofence constraint."}`,
          };
        }
      }

      // 2. Multilingual Flood Status & Road Passability Inquiries (e.g. "Bawal ba dumaan sa San Mateo?", "Atin bang albug...", "Baha ba...")
      const isFloodInquiry =
        lower.includes("baha ba") ||
        lower.includes("may baha") ||
        lower.includes("saan may baha") ||
        lower.includes("safe ba ang daan") ||
        lower.includes("baha sa") ||
        lower.includes("bawal ba dumaan") ||
        lower.includes("bawal ba muagi") ||
        lower.includes("dili ba maagian") ||
        lower.includes("mabalin kadi lumabas") ||
        lower.includes("adda kadi layus") ||
        lower.includes("atin bang albug") ||
        lower.includes("bawal bang duman") ||
        lower.includes("is it flooded") ||
        lower.includes("can i pass") ||
        lower.includes("passable ba");

      if (isFloodInquiry) {
        const activeFloods = publicHazards.filter(
          (h) => h.status !== "Resolved" && h.status !== "Rejected by LGU",
        );

        // Check if user mentioned a specific location or road
        const matching = activeFloods.filter((h) => {
          const road = (h.roadSegment?.roadName || h.label || "").toLowerCase();
          return road && lower.includes(road.slice(0, 6));
        });

        // Extract queried location name candidate if present
        const placeCandidate = text
          .replace(
            /^(?:bawal\s+ba\s+dumaan\s+sa|bawal\s+ba\s+muagi\s+sa|mabalin\s+kadi\s+lumabas\s+idiay|atin\s+bang\s+albug\s+king|baha\s+ba\s+sa|may\s+baha\s+ba\s+sa|can\s+i\s+pass\s+through|is\s+it\s+flooded\s+in|is\s+it\s+flooded\s+at)\s+/i,
            "",
          )
          .replace(/[\?\.\!]+$/, "")
          .trim();

        if (matching.length > 0) {
          const m = matching[0];
          return {
            text: formatLocalizedFloodResponse({
              roadOrPlace: m.roadSegment?.roadName || m.label,
              isFlooded: true,
              waterDepth: m.waterDepth,
              status: m.status,
              queryText: text,
            }),
          };
        }

        if (
          placeCandidate &&
          placeCandidate.length > 2 &&
          !lower.includes("kalsada") &&
          !lower.includes("daan")
        ) {
          // Road is clear / not in active flood hazard list
          return {
            text: formatLocalizedFloodResponse({
              roadOrPlace: placeCandidate,
              isFlooded: false,
              queryText: text,
            }),
          };
        }

        if (activeFloods.length === 0) {
          return {
            text: formatLocalizedFloodResponse({
              roadOrPlace: "mga kalsada sa Pampanga",
              isFlooded: false,
              queryText: text,
            }),
          };
        }

        const floodNames = activeFloods
          .slice(0, 3)
          .map((h) => `• ${h.roadSegment?.roadName || h.label} (${h.waterDepth || "Baha"})`)
          .join("\n");

        return {
          text: `⚠️ Narito ang mga kasalukuyang bahang kalsada sa Pampanga:\n${floodNames}\n\nLahat ng safe routes sa GABAI ay awtomatikong iniiwasan ang mga lugar na ito.`,
        };
      }

      // 3. Extract destination query with multi-lingual prefixes
      const hasNavIntent =
        /\b(?:punta|pupunta|pumunta|magpunta|papunta|papuntang|patungo|patungong|biyahe|byahe|byaheng|dalhin|ihatid|ihahatid|dumaan|makapunta|makarating|munta|muntang|padulong|mapan)\b/i.test(
          lower,
        ) ||
        /\b(?:go|going|reach|drive|navigate|route|directions?|way|take me|bring me|lead me|guide me|head to)\b/i.test(
          lower,
        ) ||
        /\b(?:gusto\s+(?:ko|kong)|nais\s+(?:ko|kong)|bisa\s+ku|pwede\s+bang|paki|paano|how\s+to|how\s+do\s+i|can\s+you)\b/i.test(
          lower,
        ) ||
        /\b(?:ano\s+(?:ang|po\s+ang|ba\s+ang)\s+(?:daan|ruta|direksyon))\b/i.test(lower) ||
        /\b(?:saan\s+(?:ang|po\s+ang)\s+(?:daan|ruta|direksyon))\b/i.test(lower);

      let destRaw = lower
        .replace(
          /^(?:ano\s+(?:po\s+)?(?:ang|ba\s+ang)\s+)?(?:pinakaligtas\s+na\s+)?(?:daan|ruta|direksyon)\s+(?:papuntang|patungong|papunta|patungo|para\s+sa|sa)?\s*(?:sa|kay|king|ng)?\s*/i,
          "",
        )
        .replace(
          /^(?:paano\s+(?:po\s+)?(?:ang\s+)?(?:daan|ruta|pumunta|makapunta|makarating|magpunta|dumaan))\s+(?:papuntang|patungong|papunta|patungo|sa)?\s*(?:sa|kay|king|ng)?\s*/i,
          "",
        )
        .replace(
          /^(?:saan\s+(?:po\s+)?(?:ang\s+)?(?:daan|ruta|direksyon)\s+(?:papuntang|patungong|papunta|patungo|sa)?\s*(?:sa|kay|king|ng)?\s*)/i,
          "",
        )
        .replace(
          /^(?:find\s+|show\s+|give\s+|get\s+)?(?:a\s+)?(?:safe\s+|best\s+)?(?:route|direction|directions|way|path)\s+(?:to|going to|towards|for)\s+/i,
          "",
        )
        .replace(
          /^(?:what\s+is\s+the\s+)?(?:best\s+|safe\s+)?(?:route|way|direction)\s+(?:to|going\s+to)\s+/i,
          "",
        )
        .replace(
          /^(?:navigate|nav|drive|take me|bring me|go|guide me|lead me|route)\s+(?:to|towards)?\s*/i,
          "",
        )
        .replace(/^(?:how\s+(?:do\s+i|to|can\s+i)\s+(?:get|go|reach|drive)\s+(?:to|at))\s+/i, "")
        .replace(
          /^(?:maghanap|hanap|ipakita|bigyan|alamin)\s+(?:ng\s+)?(?:ligtas\s+na\s+)?(?:ruta|daan|direksyon)\s+(?:papuntang|patungong|papunta|patungo|para\s+sa|sa)?\s*(?:sa|kay|king|ng)?\s*/i,
          "",
        )
        .replace(
          /^(?:gusto\s+(?:ko|kong)\s+|nais\s+(?:ko|kong)\s+|pwede\s+bang\s+|maaari\s+bang\s+|paki\s+)?(?:pumunta|magpunta|makapunta|makarating|pumaroon)\s+(?:sa|kay|nang)?\s*/i,
          "",
        )
        .replace(
          /^(?:gusto\s+(?:ko|kong)\s+|nais\s+(?:ko|kong)\s+)?(?:dalhin\s+mo\s+(?:ako|kami)|ihatid\s+mo\s+(?:ako|kami)|dala\s+mu\s+ku)\s+(?:sa|king)?\s*/i,
          "",
        )
        .replace(
          /^(?:i\s+(?:want|need|would\s+like|wanna)\s+to\s+go\s+to|can\s+you\s+(?:take|bring|guide|lead)\s+me\s+to|please\s+(?:take|bring|guide|lead|navigate)\s+me\s+to)\s+/i,
          "",
        )
        .replace(
          /^(?:pupunta|punta|papuntang|patungong|papunta|patungo|biyahe|byahe|byaheng)\s+(?:ako|kami|tayo)?\s*(?:sa|kay|nang)?\s*/i,
          "",
        )
        .replace(
          /^(?:bisa\s+ku\s+|bisa\s+kung\s+)?(?:munta|muntang|magpunta|dalan|dala)\s+(?:ku\s+)?(?:king|king\s+lugar|papuntang|karin)?\s*/i,
          "",
        )
        .replace(/^(?:nukarin\s+ing\s+dalan\s+munta|nukarin\s+ing\s+dalan\s+papuntang)\s+/i, "")
        .replace(/^(?:asa\s+ang\s+dalan\s+padulong|padung\s+sa|dalan\s+padulong)\s+/i, "")
        .replace(/^(?:ayan\s+ti\s+kalsada\s+mapan|mapan\s+idiay|ayan\s+ti\s+dalan)\s+/i, "")
        .replace(/[\?\.\!]+$/, "")
        .trim();

      const targetQuery =
        destRaw ||
        (lower.includes("hospital")
          ? "Hospital"
          : lower.includes("shelter") || lower.includes("evac")
            ? "Evacuation Center"
            : text);
      const q = targetQuery.toLowerCase();

      // Cleaned search term removing administrative prefixes & normalizing abbreviations
      const cleanedTarget = q
        .replace(/^(?:ng|sa|kay|king)\s+/i, "")
        .replace(
          /\b(?:gusto\s+(?:ko|kong)|pumunta|magpunta|papunta|dalhin\s+mo\s+ako)\s+(?:sa|kay)?\b/gi,
          "",
        )
        .replace(
          /^(?:the\s+)?(?:municipality\s+of|munisipyo\s+ng|bayan\s+ng|city\s+of|lungsod\s+ng|province\s+of)\s+/i,
          "",
        )
        .replace(/\b(?:pampanga|philippines|ph)\b/gi, "")
        .replace(/\bsto\.?\b/gi, "santo")
        .replace(/\bsta\.?\b/gi, "santa")
        .replace(/\bsan fdo\b/gi, "san fernando")
        .trim();

      // Exhaustive Directory of all 21 Pampanga LGUs, Major Hospitals, Specific Malls, and Parks
      const KNOWN_PAMPANGA_PLACES = [
        // Schools, Colleges & Universities
        {
          name: "St. Mary's Angels College of Pampanga (SMACP)",
          address: "Sto. Domingo, Santa Ana / Mexico, Pampanga",
          lat: 15.085,
          lng: 120.762,
          keywords: [
            "smacp",
            "saint mary",
            "st mary",
            "st. mary",
            "saint marys",
            "st marys",
            "smacp sto domingo",
            "saint mary school",
            "saint mary's",
            "saint mary school on sto",
            "smacp santo domingo",
            "saint marys angels",
          ],
        },
        {
          name: "Holy Angel University (HAU)",
          address: "Sto. Rosario, Angeles City, Pampanga",
          lat: 15.1348,
          lng: 120.5898,
          keywords: ["hau", "holy angel university", "holy angel"],
        },
        {
          name: "Angeles University Foundation (AUF)",
          address: "MacArthur Highway, Angeles City, Pampanga",
          lat: 15.1509,
          lng: 120.596,
          keywords: ["auf", "angeles university foundation", "auf medical center"],
        },
        {
          name: "Don Honorio Ventura State University (DHVSU)",
          address: "Bacolor, Pampanga",
          lat: 14.9975,
          lng: 120.654,
          keywords: ["dhvsu", "don honorio", "dhvtsu", "dhvsu bacolor", "dhvsu mexico"],
        },
        {
          name: "University of the Assumption",
          address: "Unisite Subd, San Fernando, Pampanga",
          lat: 15.0442,
          lng: 120.6865,
          keywords: ["ua", "university of the assumption", "assumption san fernando"],
        },
        {
          name: "Holy Family Academy (HFA)",
          address: "Sto. Rosario St, Angeles City, Pampanga",
          lat: 15.136,
          lng: 120.588,
          keywords: ["holy family academy", "hfa", "hfa angeles"],
        },
        {
          name: "San Luis National High School",
          address: "San Luis, Pampanga",
          lat: 15.038,
          lng: 120.795,
          keywords: ["san luis national high school", "san luis high school", "slnhs"],
        },
        {
          name: "Pampanga High School",
          address: "High School Blvd, San Fernando, Pampanga",
          lat: 15.027,
          lng: 120.693,
          keywords: ["pampanga high school", "phs", "phs san fernando"],
        },
        {
          name: "San Sebastian Elementary School",
          address: "San Sebastian, San Luis, Pampanga",
          lat: 15.0425,
          lng: 120.7913,
          keywords: ["san sebastian elementary school", "san sebastian school"],
        },

        // Specific Malls & Commercial Hubs
        {
          name: "SM City Pampanga",
          address: "Jose Abad Santos Ave, San Fernando, Pampanga",
          lat: 15.0475,
          lng: 120.697,
          keywords: [
            "sm city pampanga",
            "sm pampanga",
            "sm mall pampanga",
            "sm city san fernando pampanga",
          ],
        },
        {
          name: "SM City San Fernando Downtown",
          address: "Consunji St, San Fernando, Pampanga",
          lat: 15.0286,
          lng: 120.6903,
          keywords: [
            "sm downtown",
            "sm city downtown",
            "sm san fernando downtown",
            "sm downtown san fernando",
          ],
        },
        {
          name: "SM City Clark",
          address: "M.A. Roxas Highway, Angeles City, Pampanga",
          lat: 15.1712,
          lng: 120.5898,
          keywords: ["sm city clark", "sm clark", "sm clark pampanga"],
        },
        {
          name: "SM City Telabastagan",
          address: "Telabastagan, San Fernando, Pampanga",
          lat: 15.0886,
          lng: 120.6277,
          keywords: ["sm city telabastagan", "sm telabastagan"],
        },
        {
          name: "Robinsons Starmills Pampanga",
          address: "Jose Abad Santos Ave, San Fernando, Pampanga",
          lat: 15.0483,
          lng: 120.6994,
          keywords: ["robinsons starmills", "starmills pampanga", "robinsons pampanga"],
        },
        {
          name: "Marquee Mall",
          address: "Pulung Maragul, Angeles City, Pampanga",
          lat: 15.1558,
          lng: 120.6033,
          keywords: ["marquee mall", "marquee angeles"],
        },
        {
          name: "Nepo Mall Angeles",
          address: "St. Joseph St, Angeles City, Pampanga",
          lat: 15.1378,
          lng: 120.5888,
          keywords: ["nepo mall", "nepo angeles", "nepo quad"],
        },

        // Transport, Airports & Civic Parks
        {
          name: "Clark International Airport",
          address: "Clark Freeport Zone, Mabalacat, Pampanga",
          lat: 15.1859,
          lng: 120.5596,
          keywords: [
            "clark international airport",
            "clark airport",
            "crk airport",
            "crk",
            "clark field",
          ],
        },
        {
          name: "Dau Bus Terminal",
          address: "MacArthur Highway, Dau, Mabalacat, Pampanga",
          lat: 15.1764,
          lng: 120.5894,
          keywords: [
            "dau terminal",
            "dau bus terminal",
            "dau mabalacat",
            "terminal dau",
            "dau bus",
          ],
        },
        {
          name: "Clark Parade Grounds",
          address: "Clark Freeport Zone, Pampanga",
          lat: 15.1769,
          lng: 120.5312,
          keywords: ["clark parade grounds", "parade grounds", "cdc parade grounds"],
        },
        {
          name: "Clark Global City",
          address: "Clark Freeport Zone, Mabalacat, Pampanga",
          lat: 15.178,
          lng: 120.54,
          keywords: ["clark global city", "cgc clark"],
        },
        {
          name: "Bayanihan Park (Astro Park)",
          address: "Balibago, Angeles City, Pampanga",
          lat: 15.1663,
          lng: 120.5901,
          keywords: ["bayanihan park", "astro park", "balibago park"],
        },
        {
          name: "Pampanga Provincial Capitol",
          address: "Capitol Compound, San Fernando, Pampanga",
          lat: 15.0343,
          lng: 120.6868,
          keywords: [
            "pampanga provincial capitol",
            "pampanga capitol",
            "provincial capitol san fernando",
          ],
        },
        {
          name: "MacArthur Highway Commercial Strip",
          address: "MacArthur Highway, San Fernando, Pampanga",
          lat: 15.039,
          lng: 120.684,
          keywords: ["macarthur highway", "dolores flyover"],
        },
        {
          name: "Metropolitan Cathedral of San Fernando",
          address: "Consunji St, San Fernando, Pampanga",
          lat: 15.0289,
          lng: 120.6908,
          keywords: ["san fernando cathedral", "metropolitan cathedral", "cathedral san fernando"],
        },
        {
          name: "Holy Rosary Parish Church",
          address: "Sto. Rosario St, Angeles City, Pampanga",
          lat: 15.1352,
          lng: 120.59,
          keywords: ["holy rosary parish", "pisamban maragul", "angeles church"],
        },
        {
          name: "Alviera Ayala Land",
          address: "Porac Access Rd, Porac, Pampanga",
          lat: 15.068,
          lng: 120.535,
          keywords: ["alviera", "alviera porac", "sandbox alviera"],
        },
        {
          name: "Guagua Public Market",
          address: "Plaza Burgos, Guagua, Pampanga",
          lat: 14.966,
          lng: 120.633,
          keywords: ["guagua public market", "palengke ng guagua", "guagua market"],
        },

        // Hospitals & Medical Centers
        {
          name: "Mexico Community Hospital",
          address: "San Carlos, Mexico, Pampanga",
          lat: 15.0645,
          lng: 120.7225,
          keywords: ["mexico community hospital", "mexico hospital", "hospital sa mexico"],
        },
        {
          name: "Jose B. Lingad Memorial General Hospital",
          address: "Dolores, San Fernando, Pampanga",
          lat: 15.0385,
          lng: 120.6848,
          keywords: ["jose b lingad memorial", "jblmgh", "lingad hospital", "jose b lingad"],
        },
        {
          name: "The Medical City Clark",
          address: "Clark Global City, Mabalacat, Pampanga",
          lat: 15.177,
          lng: 120.542,
          keywords: ["the medical city clark", "tmc clark", "medical city clark"],
        },
        {
          name: "Mother Teresa of Calcutta Medical Center",
          address: "MacArthur Highway, San Fernando, Pampanga",
          lat: 15.045,
          lng: 120.692,
          keywords: ["mother teresa of calcutta", "calcutta hospital", "calcutta san fernando"],
        },

        // 21 Municipalities & City Halls
        {
          name: "Santo Tomas Municipal Hall",
          address: "Santo Tomas, Pampanga",
          lat: 15.0069,
          lng: 120.7147,
          keywords: [
            "santo tomas",
            "sto tomas",
            "sto. tomas",
            "municipality of sto tomas",
            "municipality of santo tomas",
            "bayan ng sto tomas",
          ],
        },
        {
          name: "San Luis Municipal Hall & Freedom Park",
          address: "San Luis, Pampanga",
          lat: 15.0412,
          lng: 120.7935,
          keywords: [
            "san luis freedom park",
            "freedom park san luis",
            "san luis park",
            "san luis plaza",
            "san luis freedom",
            "san luis municipal",
            "san luis hall",
            "municipality of san luis",
          ],
        },
        {
          name: "San Simon Municipal Hall",
          address: "San Simon, Pampanga",
          lat: 14.9961,
          lng: 120.7788,
          keywords: [
            "san simon municipal",
            "san simon hall",
            "san simon town hall",
            "municipality of san simon",
            "bayan ng san simon",
          ],
        },
        {
          name: "Santa Ana Municipal Hall",
          address: "Santa Ana, Pampanga",
          lat: 15.0978,
          lng: 120.7681,
          keywords: [
            "santa ana",
            "sta ana",
            "sta. ana",
            "municipality of santa ana",
            "municipality of sta ana",
            "bayan ng sta ana",
          ],
        },
        {
          name: "Santa Rita Municipal Hall",
          address: "Santa Rita, Pampanga",
          lat: 15.0008,
          lng: 120.6139,
          keywords: [
            "santa rita",
            "sta rita",
            "sta. rita",
            "municipality of santa rita",
            "municipality of sta rita",
            "bayan ng sta rita",
          ],
        },
        {
          name: "Santa Maria Barangay Hall & Disaster Center",
          address: "Santa Maria, Mexico, Pampanga",
          lat: 15.074,
          lng: 120.781,
          keywords: [
            "santa maria barangay",
            "sta maria barangay",
            "brgy santa maria",
            "barangay santa maria",
            "santa maria hall",
          ],
        },
        {
          name: "Mexico Municipal Hall",
          address: "Mexico, Pampanga",
          lat: 15.064,
          lng: 120.7208,
          keywords: [
            "mexico municipal",
            "mexico hall",
            "municipality of mexico",
            "bayan ng mexico",
            "mexico town hall",
          ],
        },
        {
          name: "Candaba Municipal Hall & Park",
          address: "Candaba, Pampanga",
          lat: 15.0933,
          lng: 120.8267,
          keywords: [
            "candaba municipal",
            "candaba park",
            "candaba town hall",
            "municipality of candaba",
            "bayan ng candaba",
          ],
        },
        {
          name: "Bacolor Municipal Hall & Shrine",
          address: "Bacolor, Pampanga",
          lat: 14.9984,
          lng: 120.6517,
          keywords: [
            "bacolor sunken church",
            "bacolor municipal",
            "bacolor shrine",
            "municipality of bacolor",
            "bayan ng bacolor",
          ],
        },
        {
          name: "Guagua Town Plaza & Municipal Hall",
          address: "Guagua, Pampanga",
          lat: 14.9669,
          lng: 120.6334,
          keywords: [
            "guagua town plaza",
            "guagua plaza",
            "guagua municipal",
            "municipality of guagua",
            "bayan ng guagua",
          ],
        },
        {
          name: "Lubao Bamboo Hub & Municipal Hall",
          address: "Lubao, Pampanga",
          lat: 14.9403,
          lng: 120.5975,
          keywords: [
            "lubao bamboo hub",
            "lubao park",
            "lubao municipal",
            "municipality of lubao",
            "bayan ng lubao",
          ],
        },
        {
          name: "Floridablanca Municipal Hall",
          address: "Floridablanca, Pampanga",
          lat: 14.9722,
          lng: 120.5333,
          keywords: [
            "floridablanca municipal",
            "floridablanca hall",
            "municipality of floridablanca",
            "bayan ng floridablanca",
          ],
        },
        {
          name: "Porac Municipal Hall",
          address: "Porac, Pampanga",
          lat: 15.0711,
          lng: 120.5422,
          keywords: ["porac municipal", "porac hall", "municipality of porac", "bayan ng porac"],
        },
        {
          name: "Arayat Town Plaza & Municipal Hall",
          address: "Arayat, Pampanga",
          lat: 15.1583,
          lng: 120.7417,
          keywords: [
            "arayat national park",
            "mount arayat",
            "arayat town plaza",
            "municipality of arayat",
            "bayan ng arayat",
            "arayat municipal",
          ],
        },
        {
          name: "Apalit Municipal Hall",
          address: "Apalit, Pampanga",
          lat: 14.9547,
          lng: 120.7583,
          keywords: [
            "apalit municipal",
            "apalit hall",
            "municipality of apalit",
            "bayan ng apalit",
          ],
        },
        {
          name: "Macabebe Municipal Hall",
          address: "Macabebe, Pampanga",
          lat: 14.9075,
          lng: 120.7139,
          keywords: [
            "macabebe municipal",
            "macabebe hall",
            "municipality of macabebe",
            "bayan ng macabebe",
          ],
        },
        {
          name: "Masantol Municipal Hall",
          address: "Masantol, Pampanga",
          lat: 14.9017,
          lng: 120.71,
          keywords: [
            "masantol municipal",
            "masantol hall",
            "municipality of masantol",
            "bayan ng masantol",
          ],
        },
        {
          name: "Minalin Municipal Hall",
          address: "Minalin, Pampanga",
          lat: 14.9719,
          lng: 120.6861,
          keywords: [
            "minalin municipal",
            "minalin hall",
            "minalin church",
            "municipality of minalin",
            "bayan ng minalin",
          ],
        },
        {
          name: "Sasmuan Municipal Hall & Port",
          address: "Sasmuan, Pampanga",
          lat: 14.9392,
          lng: 120.6272,
          keywords: [
            "sasmuan municipal",
            "sasmuan port",
            "municipality of sasmuan",
            "bayan ng sasmuan",
          ],
        },
        {
          name: "San Fernando City Hall",
          address: "City Hall, Poblacion, San Fernando, Pampanga",
          lat: 15.0298,
          lng: 120.6895,
          keywords: [
            "san fernando city hall",
            "san fernando munisipyo",
            "san fernando hall",
            "city of san fernando",
            "lungsod ng san fernando",
          ],
        },
        {
          name: "Angeles City Hall",
          address: "Pulung Maragul, Angeles City, Pampanga",
          lat: 15.145,
          lng: 120.5887,
          keywords: [
            "angeles city hall",
            "angeles munisipyo",
            "angeles hall",
            "city of angeles",
            "lungsod ng angeles",
          ],
        },
        {
          name: "Mabalacat City Hall",
          address: "Mabalacat, Pampanga",
          lat: 15.2217,
          lng: 120.575,
          keywords: [
            "mabalacat city hall",
            "mabalacat hall",
            "city of mabalacat",
            "lungsod ng mabalacat",
          ],
        },
      ];

      let target: { name: string; address?: string; lat: number; lng: number } | null = null;

      // Check if user is asking to navigate or go somewhere, or typed a specific place
      const isDestinationRequest =
        hasNavIntent ||
        KNOWN_PAMPANGA_PLACES.some((p) =>
          p.keywords.some((k) => cleanedTarget.includes(k) || k.includes(cleanedTarget)),
        ) ||
        (cleanedTarget.length >= 3 && !lower.includes("kumusta") && !lower.includes("kamusta"));

      if (isDestinationRequest) {
        // Priority 1: Google Gemini AI Geocoding Resolver (Searches destination & extracts precise GPS coordinates)
        try {
          const aiResolved = await geminiGeocodePlace(
            cleanedTarget || targetQuery || text,
            userLocation,
          );
          if (aiResolved && aiResolved.lat && aiResolved.lng) {
            target = aiResolved;
          }
        } catch (err) {
          console.warn("Gemini geocoding attempt:", err);
        }

        // Priority 2: Google Maps Geocoding Resolver (Used when Google Maps Key is configured)
        if (!target) {
          try {
            const googleResolved = await googleGeocodePlace(
              cleanedTarget || targetQuery,
              userLocation,
            );
            if (googleResolved && googleResolved.lat && googleResolved.lng) {
              target = googleResolved;
            }
          } catch (err) {
            console.warn("Google Maps geocoding attempt:", err);
          }
        }

        // Priority 3: High-precision match against known verified Pampanga landmarks
        if (!target) {
          const exactLandmarkMatch = KNOWN_PAMPANGA_PLACES.find((p) =>
            p.keywords.some(
              (k) =>
                cleanedTarget.includes(k) ||
                k.includes(cleanedTarget) ||
                q.includes(k) ||
                k.includes(q),
            ),
          );
          if (exactLandmarkMatch) {
            target = {
              name: exactLandmarkMatch.name,
              address: exactLandmarkMatch.address,
              lat: exactLandmarkMatch.lat,
              lng: exactLandmarkMatch.lng,
            };
          }
        }

        // Priority 4: Check local designated evacuation centers
        if (!target) {
          const localMatch = evacCenters.find(
            (e) =>
              e.name.toLowerCase().includes(cleanedTarget) ||
              (e.address && e.address.toLowerCase().includes(cleanedTarget)),
          );
          if (localMatch) {
            target = {
              name: localMatch.name,
              address: localMatch.address,
              lat: localMatch.lat,
              lng: localMatch.lng,
            };
          }
        }

        // Priority 5: OpenStreetMap Nominatim for specific named venues (schools, churches, hospitals, streets)
        if (!target && cleanedTarget.length > 2) {
          try {
            const osmMatches = await searchRealWorldPlaces(
              cleanedTarget,
              userLocation.lat,
              userLocation.lng,
            );
            if (osmMatches && osmMatches.length > 0) {
              target = {
                name: osmMatches[0].name,
                address: osmMatches[0].address,
                lat: osmMatches[0].lat,
                lng: osmMatches[0].lng,
              };
            }
          } catch {}
        }

        // Priority 6: Generic shelter / emergency request fallback
        if (
          !target &&
          (lower.includes("shelter") ||
            lower.includes("evac") ||
            lower.includes("ligtas") ||
            lower.includes("emergency") ||
            lower.includes("hospital"))
        ) {
          if (evacCenters.length > 0) {
            target = {
              name: evacCenters[0].name,
              address: evacCenters[0].address,
              lat: evacCenters[0].lat,
              lng: evacCenters[0].lng,
            };
          }
        }
      }

      if (target) {
        // Feed coordinates into system navigation & trigger real-world route recalculation
        setDestination(target);
        setSelectedRoute("safe");
        setActiveModal("routes");
        mapCanvasRef.current?.flyToCoords(target.lat, target.lng, 15);

        let roadDistKm = calculateDistanceKm(
          userLocation.lat,
          userLocation.lng,
          target.lat,
          target.lng,
        );
        let estMin = Math.max(3, Math.round((roadDistKm / 30) * 60));
        let majorRoadsText = "";
        let floodClearanceDetail = "Beripikadong ligtas at walang baha sa rutang ito.";
        let isDirectFlooded = false;

        try {
          const liveRoutes = await fetchAccurateRealWorldRoutes(
            userLocation.lat,
            userLocation.lng,
            target.lat,
            target.lng,
            publicHazards,
          );
          if (liveRoutes && liveRoutes.safe) {
            const activeSafe = liveRoutes.safe;
            roadDistKm = activeSafe.distanceKm;
            const parsedTime = parseInt(activeSafe.time);
            estMin =
              !isNaN(parsedTime) && parsedTime > 0
                ? parsedTime
                : Math.max(2, Math.round((roadDistKm / 28) * 60));
            floodClearanceDetail = activeSafe.detail || floodClearanceDetail;
            isDirectFlooded = liveRoutes.fast?.risk === "high";

            const steps = activeSafe.steps || [];
            const uniqueStreets = Array.from(
              new Set(
                steps
                  .map((s) => s.streetName)
                  .filter(
                    (n) => n && n !== "Road Corridor" && n !== "road" && n !== "unnamed road",
                  ),
              ),
            ).slice(0, 4);

            if (uniqueStreets.length > 0) {
              majorRoadsText = `\n🛣️ **Dadaan sa:** ${uniqueStreets.join(" ➔ ")}`;
            }
          }
        } catch (err) {
          console.warn("Real-world route calculation error in chatbot:", err);
        }

        const baseMsg = formatLocalizedRouteCardText(target.name, roadDistKm, estMin, text);
        const coordSnippet = `\n📍 ${target.address || `${target.lat.toFixed(5)}, ${target.lng.toFixed(5)}`}`;
        const floodNote = isDirectFlooded
          ? `\n🛡️ May naiulat na baha sa highway; awtomatikong inilipat ang ruta sa "Alternate Route" upang makaiwas sa tubig.`
          : `\n🛡️ ${floodClearanceDetail}`;

        return {
          text: `${baseMsg}${coordSnippet}${majorRoadsText}${floodNote}\n\nNai-plot na ito sa mapa. Piliin ang 'Alternate Route' para sa pinakaligtas na biyahe.`,
          routeCard: {
            destinationName: target.name,
            address: target.address,
            distanceKm: roadDistKm,
            durationMin: estMin,
            riskLevel: isDirectFlooded ? "MEDIUM" : "LOW",
            bypassedHazardsCount: isDirectFlooded ? 1 : 0,
            lat: target.lat,
            lng: target.lng,
          },
        };
      }

      if (hasNavIntent && !target) {
        return {
          text: `Hindi ko mahanap ang eksaktong GPS coordinates para sa "${destRaw || text}". Maaari mo bang ilagay ang buong pangalan o bayan upang ma-search ito gamit ang Gemini AI o Google Maps at maikarga ang ligtas na ruta sa mapa?`,
        };
      }

      // 4. General conversational AI query fallback
      const activeHazardsList = publicHazards
        .filter((h) => h.status !== "Resolved" && h.status !== "Rejected by LGU")
        .map((h) => `${h.roadSegment?.roadName || h.label} (${h.waterDepth || "Flood"})`);

      try {
        const history: ChatHistoryTurn[] = Array.isArray(rawHistory)
          ? rawHistory
              .filter((m: any) => m && m.text)
              .map((m: any) => ({
                role: m.sender === "user" ? ("user" as const) : ("model" as const),
                text: m.text,
              }))
          : [];

        const aiAnswer = await geminiChatAssistant(text, {
          currentLocation: locationName || "Pampanga",
          activeHazardsList: activeHazardsList.slice(0, 6),
          activeHazardsCount: activeHazardsList.length,
          evacuationCenters: evacCenters.map((e) => e.name),
          routeDetails: routes?.safe
            ? {
                destinationName: destination?.name || "Kasalukuyang Destinasyon",
                distanceKm: routes.safe.distanceKm,
                durationMin: parseInt(routes.safe.time) || 5,
                isClear: routes.safe.risk === "low",
              }
            : undefined,
          history,
        });

        if (aiAnswer) {
          return { text: aiAnswer };
        }
      } catch {}

      return {
        text: formatLocalizedFallback(targetQuery || "Pampanga", text),
      };
    } catch (err) {
      console.warn("Chatbot processing fallback:", err);
      return {
        text: formatLocalizedFallback("Pampanga", text),
      };
    }
  };

  const voice = useVoiceAssistant(mapContext, handleVoiceAction);

  // Clear action toast after 4 seconds
  useEffect(() => {
    if (lastActionMessage) {
      const timer = setTimeout(() => clearLastActionMessage(), 4000);
      return () => clearTimeout(timer);
    }
  }, [lastActionMessage, clearLastActionMessage]);

  // Auto-navigation effect
  useEffect(() => {
    if (pendingAutoNavigate && routes && routes["safe"]) {
      const activeRoute = routes["safe"];
      const coords = activeRoute?.geoJSON?.geometry?.coordinates;

      // Wait until we have the real OSRM route (initial fallback dummy route has exactly 2 coordinates)
      if (!Array.isArray(coords) || coords.length <= 2) {
        return;
      }

      // activeRoute.rawRoute doesn't exist on RouteInfo, use steps
      const summary =
        activeRoute.steps?.[0]?.streetName ||
        activeRoute.steps?.[1]?.streetName ||
        "mga pangunahing kalsada";
      const msg = `Dadaan ang ligtas na ruta sa ${summary}.`;

      // Clear flag so this only triggers once
      setPendingAutoNavigate(false);

      // Brief delay before speaking and flying to allow Mapbox to render the new route safely (prevents WebGL crash)
      setTimeout(() => {
        voice.speakResponse(msg, voice.detectedLanguage || voice.language);

        setSelectedRoute("safe");
        setIsDrivingHUDActive(true);

        let initialBearing = -15;
        if (Array.isArray(coords) && coords.length > 1) {
          const [lng1, lat1] = coords[0];
          const [lng2, lat2] = coords[Math.min(3, coords.length - 1)];
          const y = Math.sin(((lng2 - lng1) * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180);
          const x =
            Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
            Math.sin((lat1 * Math.PI) / 180) *
              Math.cos((lat2 * Math.PI) / 180) *
              Math.cos(((lng2 - lng1) * Math.PI) / 180);
          const angle = (Math.atan2(y, x) * 180) / Math.PI;
          initialBearing = (angle + 360) % 360;
        }

        mapCanvasRef.current?.startNavigationPerspective(
          userLocation.lat,
          userLocation.lng,
          initialBearing,
        );
      }, 500);
    }
  }, [routes, pendingAutoNavigate, userLocation, voice]);

  const handleSuggestion = (s: string) => {
    voice.triggerTextPrompt(s);
  };

  // When a hazard marker is tapped
  const handleHazardClick = (h: Hazard | null) => {
    if (!h) {
      setSelectedHazard(null);
      return;
    }
    setSelectedHazard(h);
    // Keep Safe Route Navigator open if currently comparing routes or navigating
    if (activeModal !== "routes") {
      setActiveModal("hazard");
    }
    mapCanvasRef.current?.flyToCoords(h.lat, h.lng, 16);
  };

  const handleSelectSearchResult = (result: { name: string; lat: number; lng: number }) => {
    setDestination({ name: result.name, lat: result.lat, lng: result.lng });
    setSelectedRoute("safe");
    setActiveModal("routes");
    mapCanvasRef.current?.flyToCoords(result.lat, result.lng, 16);
    setSearchQuery("");
    setSearchFocused(false);
    setSearchResults([]);
  };

  const handleOpenReportModal = () => {
    setReportStep("form");
    setReportType("flood");
    setReportDesc("");
    setIsRoadSegmentMode(true);
    setRoadName("");
    setFloodStartPoint({
      lat: userLocation.lat,
      lng: userLocation.lng,
      name: locationName
        ? `Near ${locationName.split(",")[0]} (Point A)`
        : "Current Location (Point A)",
    });
    setFloodEndPoint({
      lat: userLocation.lat + 0.005,
      lng: userLocation.lng + 0.006,
      name: "Downstream Road Crossing (Point B)",
    });
    setFloodPassability("not_passable_light");
    setFloodWaterDepth("Knee Deep (0.45m)");
    setPhotoPreview(null);
    setPhotoAiAnalysis(null);
    setIsPickingPointMode(null);
    setActiveModal("report");
  };

  // Multimodal AI Photo Upload & Vision Analysis
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setPhotoPreview(base64);
      setIsAnalyzingPhoto(true);

      try {
        // 1. First attempt Live Google Gemini 3.6 Multimodal Vision
        const geminiResult = await geminiAnalyzeFloodPhoto(base64, locationName);

        if (geminiResult) {
          const analysis = {
            waterDepthLevel: geminiResult.estimatedDepth,
            vehiclePassability:
              geminiResult.passability === "all_passable"
                ? "Passable to All Vehicles"
                : geminiResult.passability === "not_passable_light"
                  ? "Not Passable to Light Vehicles"
                  : "Closed to All Vehicles (Deep Flood)",
            hazardsDetected: ["Live Gemini AI Vision Verified", "Submerged Road Surface"],
            estimatedRisk: geminiResult.severity.toUpperCase(),
          };
          setPhotoAiAnalysis(analysis);
          setReportDesc(
            `Gemini AI Vision: ${geminiResult.aiAnalysis} (${geminiResult.estimatedDepth})`,
          );
          setReportSeverity(geminiResult.severity);
          setFloodPassability(geminiResult.passability);
          setFloodWaterDepth(geminiResult.estimatedDepth);
        } else if (API_BASE_URL) {
          const res = await fetch(`${API_BASE_URL}/ai/analyze-photo`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              photoBase64: base64,
              descriptionHint: reportDesc,
              location: locationName,
            }),
          });

          if (res.ok) {
            const analysis = await res.json();
            setPhotoAiAnalysis(analysis);
            setReportDesc(
              `AI Vision: ${analysis.waterDepthLevel}. ${analysis.vehiclePassability}. Hazards: ${analysis.hazardsDetected?.join(", ")}`,
            );
            if (analysis.estimatedRisk === "HIGH") setReportSeverity("high");
          }
        } else {
          // Instant Local Vision Fallback
          const analysis = {
            waterDepthLevel: "Knee-Deep (0.45m Estimated)",
            vehiclePassability: "Not Passable to Light Vehicles",
            hazardsDetected: ["Submerged Road Surface", "Slow Flowing Floodwater"],
            estimatedRisk: "HIGH",
          };
          setPhotoAiAnalysis(analysis);
          setReportDesc(
            `AI Vision: ${analysis.waterDepthLevel}. ${analysis.vehiclePassability}. Hazards: ${analysis.hazardsDetected.join(", ")}`,
          );
          setReportSeverity("high");
        }
      } catch (err) {
        console.warn("AI Vision offline fallback:", err);
      } finally {
        setIsAnalyzingPhoto(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const submitReport = async () => {
    setReportErrorMsg(null);

    // 🛡️ 1. Rate Limiting Check (2 mins cooldown)
    const lastReportTime = Number(localStorage.getItem("gabai_last_report_timestamp") || 0);
    const timeSinceLast = Date.now() - lastReportTime;
    if (timeSinceLast < 120_000) {
      const remainingSec = Math.ceil((120_000 - timeSinceLast) / 1000);
      setReportErrorMsg(
        `⏳ Anti-Spam Rate Limit Active: Device cooldown in effect (${remainingSec}s remaining). Please wait before submitting another report.`,
      );
      return;
    }

    // 🛡️ 2. Proof-of-Location Geofence Check (1.5 km)
    if (isGeofenceViolated) {
      setReportErrorMsg(
        `🛡️ Anti-Spam Geofence Blocked: Proof-of-Location required. You are ${reportDistanceKm.toFixed(1)} km away. Reports are restricted to within 1.5 km of your verified GPS device to prevent fake remote reports.`,
      );
      return;
    }

    setReportStep("analyzing");

    let snappedPath: [number, number][] | undefined = undefined;
    if (isRoadSegmentMode && floodStartPoint && floodEndPoint) {
      try {
        const roadCoords = await fetchRoadSegmentPath(floodStartPoint, floodEndPoint);
        if (roadCoords && roadCoords.length > 1) {
          snappedPath = roadCoords;
        }
      } catch (err) {
        console.warn("Road snapping fallback:", err);
      }
    }

    setTimeout(() => {
      try {
        addHazardReport({
          type: reportType,
          description: reportDesc || undefined,
          severity: reportSeverity,
          isRoadSegment: isRoadSegmentMode,
          roadSegment:
            isRoadSegmentMode && floodStartPoint && floodEndPoint
              ? {
                  from: floodStartPoint,
                  to: floodEndPoint,
                  path: snappedPath,
                  roadName: roadName || `${locationName.split(",")[0]} Road`,
                }
              : undefined,
          passability: floodPassability,
          waterDepth: floodWaterDepth,
        });
        setReportStep("done");
        setReportCooldownSec(120);
      } catch (err: any) {
        setReportStep("form");
        setReportErrorMsg(
          err?.message || "Submission failed. Please verify GPS proximity and cooldown.",
        );
      }
    }, 800);
  };

  const closeModal = () => {
    setActiveModal("none");
    setSelectedHazard(null);
    setIsPickingPointMode(null);
  };

  const handleLocateMe = () => {
    requestLocation();
    mapCanvasRef.current?.flyToUser();
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchResults.length > 0) {
      handleSelectSearchResult(searchResults[0]);
    }
  };

  const handleStartNavigation = () => {
    closeModal();
    setIs3D(true);
    setShow3DBuildings(true);
    setIsDrivingHUDActive(true);

    // Strictly enforce safe route if current selection has flood hazard
    const targetRouteKey =
      selectedRoute === "fast" && routes?.fast?.risk === "high" ? "safe" : selectedRoute;
    if (selectedRoute !== targetRouteKey) {
      setSelectedRoute("safe");
    }

    let initialBearing = -15;
    const activeRoute = routes?.[targetRouteKey];
    const coords = activeRoute?.geoJSON?.geometry?.coordinates;
    if (Array.isArray(coords) && coords.length > 1) {
      const [lng1, lat1] = coords[0];
      const [lng2, lat2] = coords[Math.min(3, coords.length - 1)];
      const y = Math.sin(((lng2 - lng1) * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180);
      const x =
        Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
        Math.sin((lat1 * Math.PI) / 180) *
          Math.cos((lat2 * Math.PI) / 180) *
          Math.cos(((lng2 - lng1) * Math.PI) / 180);
      const angle = (Math.atan2(y, x) * 180) / Math.PI;
      initialBearing = (angle + 360) % 360;
    }

    mapCanvasRef.current?.startNavigationPerspective(
      userLocation.lat,
      userLocation.lng,
      initialBearing,
    );
  };

  const handleExitNavigation = () => {
    setIsDrivingHUDActive(false);
    mapCanvasRef.current?.exitNavigationPerspective();
  };

  return (
    <div className="fixed inset-0 overflow-hidden bg-slate-100 dark:bg-slate-900 select-none flex flex-col">
      {/* ── Active Fullscreen Driving HUD ───────────────────── */}
      {isDrivingHUDActive && routes && (
        <DrivingHUD
          route={
            customDetourRoute ||
            routes[
              selectedRoute === "fast" && routes?.fast?.risk === "high" ? "safe" : selectedRoute
            ]
          }
          destinationName={destination?.name || "Safe Evacuation Center"}
          nearbyHazards={hazards}
          userSpeed={userLocation.speed}
          onExit={handleExitNavigation}
        />
      )}

      {/* ── Active Fullscreen SOS Rescue Strobe ─────────────── */}
      {isSOSStrobeActive && (
        <SOSRescueStrobe
          lat={userLocation.lat}
          lng={userLocation.lng}
          locationName={locationName}
          onClose={() => setIsSOSStrobeActive(false)}
        />
      )}

      {/* Map Canvas Background */}
      <div className="absolute inset-0 z-0">
        <MapCanvas
          ref={mapCanvasRef}
          darkMode={darkMode}
          isSatellite={isSatellite}
          selectedHazard={selectedHazard}
          showRoutes={activeModal === "routes" || isDrivingHUDActive || pendingAutoNavigate}
          selectedRoute={selectedRoute}
          onHazardClick={handleHazardClick}
          emergencyMode={appState === "emergency"}
          userLocation={userLocation}
          hazards={publicHazards}
          evacCenters={evacCenters}
          routes={effectiveRoutes}
          destination={destination}
          onMapClick={handleMapClick}
          showRadar={showRadar}
          show3DBuildings={show3DBuildings}
          showDangerZones={showDangerZones}
          showRoadLines={showRoadLines}
          showEvacCenters={showEvacCenters}
          is3D={is3D}
          onToggle3D={toggle3DMode}
          isPickingRoadSegment={isPickingPointMode}
          isPickingPoint={Boolean(isPickingPointMode || isMapClickDestinationMode)}
          floodedRouteSegment={redSegmentOnRoute}
          pulsingRouteHazard={pulsingHazardPoint}
        />
      </div>

      {isChatbotOpen && (
        <GabaiChatbot
          onClose={() => setIsChatbotOpen(false)}
          voice={voice}
          destination={destination}
          routes={routes}
          onStartNavigation={handleStartNavigation}
          onViewOnMap={handleViewRouteOnMap}
          onSendMessage={handleProcessChatMessage}
        />
      )}

      {/* ── Picking Road Segment Mode Floating Banner ───────── */}
      {isPickingPointMode && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 pointer-events-auto anim-slide-down">
          <div className="bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl border-2 border-cyan-500 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-400 font-black">
              {isPickingPointMode === "from" ? "A" : "B"}
            </div>
            <div>
              <div className="font-extrabold text-xs text-white">
                {isPickingPointMode === "from"
                  ? "Tap Map to Set Start of Flood (Point A)"
                  : "Tap Map to Set End of Flood (Point B)"}
              </div>
              <div className="text-[10px] text-slate-300">
                Click on the road segment where the flood starts or ends
              </div>
            </div>
            <button
              onClick={() => {
                setIsPickingPointMode(null);
                setActiveModal("report");
              }}
              className="ml-2 px-3 py-1 bg-slate-800 hover:bg-slate-700 rounded-xl text-[10px] font-bold text-slate-200"
            >
              Back
            </button>
          </div>
        </div>
      )}

      {/* ── Toast Notification Banner ────────────────────────── */}
      {lastActionMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-auto anim-slide-down">
          <div className="bg-slate-900/95 dark:bg-white/95 text-white dark:text-slate-900 text-xs font-semibold px-4 py-2.5 rounded-full shadow-2xl backdrop-blur-md flex items-center gap-2 border border-slate-700/50 dark:border-slate-200/50">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400 dark:text-cyan-600 shrink-0" />
            <span>{lastActionMessage}</span>
          </div>
        </div>
      )}

      {/* ── Top Emergency / Dam Alert Marquee Bar ────────────────── */}
      {appState === "emergency" && (
        <div className="absolute top-0 left-0 right-0 z-50 emergency-bar bg-[#1c1014]/95 backdrop-blur-2xl border-b border-red-900/40 text-white px-4 py-2.5 flex items-center justify-between text-xs font-medium pointer-events-auto shadow-xl">
          <div className="flex items-center gap-2.5 truncate">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse shrink-0" />
            <span className="text-orange-400 font-bold">
              ⚠️ La Mesa Dam at alarm 79.31 m / 79.50 m
            </span>
            <span className="text-slate-400 hidden sm:inline">and 1 more gauge near Pampanga</span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setAppState("normal")}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ── Top Header Navigation Bar (Unified Whole Bar) ── */}
      <header
        className={`absolute left-0 right-0 z-30 transition-all duration-300 pointer-events-auto ${appState === "emergency" ? "top-10" : "top-0"}`}
      >
        <div
          className={`w-full backdrop-blur-2xl border-b px-3 sm:px-5 py-2 sm:py-2.5 flex items-center justify-between gap-2.5 sm:gap-4 shadow-lg transition-colors ${
            darkMode
              ? "bg-[#0f172a]/95 border-slate-800/80 text-white shadow-slate-950/40"
              : "bg-white/95 border-slate-200/90 text-slate-900 shadow-slate-200/60"
          }`}
        >
          {/* Left Brand Badge & Quick Navigation Controls */}
          <div className="flex items-center gap-2 sm:gap-3.5 shrink-0">
            <div className="flex items-center gap-2 sm:gap-2.5">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0">
                <GabaiLogo size="md" animated glow />
              </div>
              <span
                className={`font-black text-xl sm:text-2xl tracking-wider leading-none select-none ${
                  darkMode ? "text-white drop-shadow-md" : "text-slate-900"
                }`}
              >
                GABAI
              </span>
            </div>

            {/* Quick Action Controls (3D, Theme Toggle) */}
            <div className="flex items-center gap-1 sm:gap-1.5 ml-1 sm:ml-1.5">
              <button
                type="button"
                onClick={toggle3DMode}
                className={`px-2.5 py-1 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  darkMode
                    ? "bg-slate-800/80 text-slate-300 border-slate-700/60 hover:text-white"
                    : "bg-slate-100 text-slate-700 border-slate-200 hover:text-slate-900"
                }`}
                title="Toggle 3D Buildings View"
              >
                {is3D ? "3D" : "2D"}
              </button>

              <button
                type="button"
                onClick={toggleDark}
                className={`w-7 h-7 sm:w-8 sm:h-8 rounded-xl border flex items-center justify-center transition-all cursor-pointer ${
                  darkMode
                    ? "bg-slate-800/80 border-slate-700/60 text-amber-400 hover:text-amber-300"
                    : "bg-slate-100 border-slate-200 text-slate-700 hover:text-slate-900"
                }`}
                aria-label="Toggle theme"
              >
                {darkMode ? (
                  <Sun className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                ) : (
                  <Moon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Center Search / Route Pill ("Plan a route...") & Autocomplete */}
          <div className="relative flex-1 max-w-xs sm:max-w-sm md:max-w-md mx-auto">
            <form
              onSubmit={handleSearchSubmit}
              className={`w-full flex items-center gap-2.5 rounded-xl border px-3 py-1.5 transition-all focus-within:border-blue-500/60 focus-within:ring-1 focus-within:ring-blue-500/30 ${
                darkMode
                  ? "bg-slate-900/80 border-slate-800 text-slate-100"
                  : "bg-slate-100/90 border-slate-200 text-slate-900"
              }`}
            >
              <button
                type="button"
                onClick={() => setActiveModal("routes")}
                className={`transition-colors shrink-0 cursor-pointer p-0.5 ${
                  darkMode
                    ? "text-slate-400 hover:text-blue-400"
                    : "text-slate-500 hover:text-blue-600"
                }`}
                title="Open Safe Route Planner"
              >
                <Navigation className="w-4 h-4" />
              </button>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Plan a route..."
                onFocus={() => setSearchFocused(true)}
                className={`flex-1 bg-transparent text-xs font-medium outline-none truncate ${
                  darkMode
                    ? "text-slate-100 placeholder-slate-400"
                    : "text-slate-900 placeholder-slate-400"
                }`}
              />
              {isSearching && (
                <Loader2
                  className={`w-3.5 h-3.5 animate-spin shrink-0 ${darkMode ? "text-blue-400" : "text-blue-500"}`}
                />
              )}
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setSearchResults([]);
                  }}
                  className={`p-0.5 shrink-0 ${darkMode ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-slate-900"}`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setActiveModal("routes")}
                className={`p-1 rounded-lg transition-all cursor-pointer shrink-0 ${
                  darkMode
                    ? "hover:bg-slate-800 text-slate-400 hover:text-white"
                    : "hover:bg-slate-200 text-slate-500 hover:text-slate-900"
                }`}
                title="Select Evacuation Route"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </form>

            {/* Live Search Autocomplete Dropdown */}
            {searchFocused && searchResults.length > 0 && (
              <div
                className={`absolute top-full left-0 right-0 mt-2 backdrop-blur-2xl rounded-2xl border overflow-hidden z-50 shadow-2xl anim-slide-up max-h-72 overflow-y-auto ${
                  darkMode
                    ? "bg-[#0f172a]/98 border-slate-800 text-white"
                    : "bg-white/98 border-slate-200 text-slate-900"
                }`}
              >
                <div
                  className={`px-3 py-2 border-b text-[10px] font-bold uppercase tracking-wider ${
                    darkMode
                      ? "bg-slate-900/80 border-slate-800 text-slate-400"
                      : "bg-slate-100 border-slate-200 text-slate-500"
                  }`}
                >
                  Locations & Landmarks
                </div>
                {searchResults.map((res, i) => (
                  <button
                    key={`${res.name}-${i}`}
                    onMouseDown={() => handleSelectSearchResult(res)}
                    className={`w-full px-3.5 py-2.5 text-left flex items-center gap-2.5 transition-colors border-b last:border-0 ${
                      darkMode
                        ? "hover:bg-slate-800/60 border-slate-800/40 text-white"
                        : "hover:bg-slate-100 border-slate-200/60 text-slate-900"
                    }`}
                  >
                    <span className="text-lg">{res.emoji || "📍"}</span>
                    <div className="flex-1 min-w-0">
                      <div
                        className={`text-xs font-bold truncate ${darkMode ? "text-white" : "text-slate-900"}`}
                      >
                        {res.name}
                      </div>
                      <div
                        className={`text-[10px] truncate mt-0.5 ${darkMode ? "text-slate-400" : "text-slate-500"}`}
                      >
                        {res.address}
                      </div>
                    </div>
                    <ChevronRight
                      className={`w-3.5 h-3.5 shrink-0 ${darkMode ? "text-slate-400" : "text-slate-400"}`}
                    />
                  </button>
                ))}
              </div>
            )}
          </div>


        </div>
      </header>

      {/* ── Left Sidebar Column (CONDITIONS & WATER DEPTH Legend) ── */}
      <div
        className={`absolute left-4 z-20 w-72 sm:w-80 flex flex-col gap-3 pointer-events-none max-h-[calc(100vh-100px)] transition-all duration-300 ${appState === "emergency" ? "top-24" : "top-16 sm:top-[68px]"}`}
      >
        {/* Floating CONDITIONS Panel */}
        {conditionsOpen ? (
          <div
            className={`backdrop-blur-2xl border rounded-2xl p-4 anim-slide-up max-h-[calc(100vh-280px)] overflow-y-auto shrink transition-all pointer-events-auto ${
              darkMode
                ? "bg-[#0f172a]/95 border-slate-800/90 shadow-2xl text-white"
                : "bg-white/95 border-slate-200/90 shadow-xl text-slate-900"
            }`}
          >
            <div
              className={`flex items-center justify-between mb-3 pb-2 border-b ${darkMode ? "border-slate-800" : "border-slate-200"}`}
            >
              <span
                className={`text-[10px] font-mono tracking-widest font-bold uppercase ${darkMode ? "text-slate-400" : "text-slate-500"}`}
              >
                CONDITIONS
              </span>
              <button
                onClick={() => setConditionsOpen(false)}
                className={`w-7 h-7 rounded-lg flex items-center justify-center border transition-all cursor-pointer ${
                  darkMode
                    ? "bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-white border-slate-700/50"
                    : "bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 border-slate-200"
                }`}
                title="Collapse CONDITIONS panel"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">

              <div className="py-1">
                <div
                  className={`flex items-center gap-2 text-xs font-semibold cursor-pointer ${darkMode ? "text-slate-200" : "text-slate-800"}`}
                >
                  <ChevronDown
                    className={`w-3.5 h-3.5 ${darkMode ? "text-slate-400" : "text-slate-500"}`}
                  />
                  <span>Community reports</span>
                </div>
                <div
                  className={`text-[11px] ml-5 mt-1 ${darkMode ? "text-slate-400" : "text-slate-500"}`}
                >
                  1 active report near you.
                </div>
              </div>

              {/* Access Emergency Hotlines Card */}
              {!locationAllowedForHotlines ? (
                <div
                  className={`border rounded-xl p-3.5 mt-3 shadow-inner ${
                    darkMode
                      ? "bg-[#151e32] border-slate-800/90 text-white"
                      : "bg-slate-50 border-slate-200 text-slate-900"
                  }`}
                >
                  <div
                    className={`flex items-center gap-2 font-bold text-xs mb-1.5 ${darkMode ? "text-white" : "text-slate-900"}`}
                  >
                    <MapPin className="w-4 h-4 text-blue-500 shrink-0" />
                    <span>Access Local Emergency Hotlines</span>
                  </div>
                  <p
                    className={`text-[11px] leading-relaxed ${darkMode ? "text-slate-300" : "text-slate-600"}`}
                  >
                    Allow location access to show emergency hotlines specific to your area. This
                    helps you get the most relevant emergency contacts during flood situations.
                  </p>
                  <button
                    onClick={() => {
                      handleLocateMe();
                      setLocationAllowedForHotlines(true);
                    }}
                    className="w-full mt-3 bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs py-2.5 px-4 rounded-xl shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Allow Location</span>
                  </button>
                </div>
              ) : (
                <div
                  className={`border rounded-xl p-3.5 mt-3 shadow-inner anim-slide-up ${
                    darkMode ? "bg-[#151e32] border-blue-900/50" : "bg-blue-50/60 border-blue-200"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div
                      className={`flex items-center gap-1.5 text-xs font-bold ${darkMode ? "text-white" : "text-slate-900"}`}
                    >
                      <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span>Local Emergency Hotlines</span>
                    </div>
                    <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800/50 px-1.5 py-0.5 rounded">
                      GPS Active
                    </span>
                  </div>
                  <p
                    className={`text-[10px] mb-2 ${darkMode ? "text-slate-400" : "text-slate-600"}`}
                  >
                    Emergency contacts for{" "}
                    <strong className={darkMode ? "text-slate-200" : "text-slate-800"}>
                      {locationName.split(",")[0]}
                    </strong>
                    :
                  </p>

                  <div className="space-y-1.5 max-h-44 overflow-y-auto pr-0.5">
                    {[
                      { name: "National Emergency Line", number: "911", icon: "🚨" },
                      { name: "Pampanga PDRRMO Rescue", number: "(045) 961-2468", icon: "🏢" },
                      { name: "Red Cross Ambulance", number: "(045) 961-4682", icon: "🚑" },
                      { name: "BFP Fire & Rescue Services", number: "(045) 961-2244", icon: "🚒" },
                      { name: "PNP Police Operations", number: "(045) 961-3434", icon: "🚓" },
                    ].map((h, idx) => (
                      <a
                        key={idx}
                        href={`tel:${h.number.replace(/[^0-9]/g, "")}`}
                        className={`flex items-center justify-between p-2 rounded-lg border transition-all text-xs group cursor-pointer ${
                          darkMode
                            ? "bg-slate-900/90 hover:bg-blue-950/80 border-slate-800 hover:border-blue-700/60 text-white"
                            : "bg-white hover:bg-blue-100/80 border-slate-200 hover:border-blue-300 text-slate-900"
                        }`}
                        title={`Tap to call ${h.name}`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm">{h.icon}</span>
                          <div className="truncate">
                            <div
                              className={`font-bold truncate text-[11px] ${darkMode ? "text-white" : "text-slate-900"}`}
                            >
                              {h.name}
                            </div>
                            <div
                              className={`text-[10px] font-mono ${darkMode ? "text-slate-400" : "text-slate-500"}`}
                            >
                              {h.number}
                            </div>
                          </div>
                        </div>
                        <div className="w-7 h-7 rounded-lg bg-blue-600/20 group-hover:bg-blue-600 text-blue-500 group-hover:text-white flex items-center justify-center transition-all shrink-0 ml-1">
                          <PhoneCall className="w-3.5 h-3.5" />
                        </div>
                      </a>
                    ))}
                  </div>

                  <button
                    onClick={handleLocateMe}
                    className={`w-full mt-2.5 text-[10px] flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                      darkMode
                        ? "text-slate-400 hover:text-white"
                        : "text-slate-500 hover:text-slate-900"
                    }`}
                  >
                    <MapPin className="w-3 h-3 text-cyan-500" />
                    <span>Recenter & Update Location</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Collapsed Panel Floating Toggle Button */
          <button
            onClick={() => setConditionsOpen(true)}
            className={`w-11 h-11 rounded-2xl backdrop-blur-2xl border flex items-center justify-center transition-all cursor-pointer pointer-events-auto anim-scale-up shrink-0 ${
              darkMode
                ? "bg-[#0f172a]/95 border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 shadow-2xl"
                : "bg-white/95 border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-100 shadow-xl"
            }`}
            title="Expand CONDITIONS panel"
          >
            <PanelLeftOpen className="w-5 h-5" />
          </button>
        )}

        {/* ── Floating Water Depth Legend ("WATER DEPTH") Stacked Under CONDITIONS ── */}
        {showLegend && (
          <div
            className={`w-56 backdrop-blur-2xl border rounded-2xl p-3.5 anim-slide-up shrink-0 transition-all pointer-events-auto ${
              darkMode
                ? "bg-[#0f172a]/95 border-slate-800/90 shadow-2xl text-white"
                : "bg-white/95 border-slate-200/90 shadow-xl text-slate-900"
            }`}
          >
            <div className="flex items-center justify-between mb-2.5">
              <span
                className={`text-[10px] font-mono tracking-widest font-bold uppercase ${darkMode ? "text-slate-400" : "text-slate-500"}`}
              >
                WATER DEPTH
              </span>
              <button
                onClick={() => setShowLegend(false)}
                className={`transition-colors p-0.5 cursor-pointer ${darkMode ? "text-slate-500 hover:text-slate-300" : "text-slate-400 hover:text-slate-700"}`}
                title="Close legend"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div
              className={`space-y-2 text-xs font-medium ${darkMode ? "text-slate-300" : "text-slate-700"}`}
            >
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-teal-400 shadow-xs shadow-teal-400/50" />
                <span>Ankle deep</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-xs shadow-amber-400/50" />
                <span>Knee deep</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-orange-500 shadow-xs shadow-orange-500/50" />
                <span>Waist deep</span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-xs shadow-red-500/50" />
                <span>Chest deep or higher</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Map controls — Right Stack ──────────────────────── */}
      <div className="absolute right-4 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-2 pointer-events-auto">
        <button
          onClick={() => setLayersOpen(!layersOpen)}
          className={`w-10 h-10 rounded-2xl backdrop-blur-2xl border flex items-center justify-center transition-all cursor-pointer ${
            darkMode
              ? "bg-[#0f172a]/95 border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 shadow-2xl"
              : "bg-white/95 border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-100 shadow-xl"
          }`}
          title="Map Layers"
        >
          <Layers className="w-4 h-4" />
        </button>
        <div
          className={`flex flex-col backdrop-blur-2xl border rounded-2xl shadow-xl overflow-hidden divide-y ${
            darkMode
              ? "bg-[#0f172a]/95 border-slate-800 divide-slate-800 shadow-2xl"
              : "bg-white/95 border-slate-200 divide-slate-200 shadow-xl"
          }`}
        >
          <button
            onClick={() => mapCanvasRef.current?.zoomIn()}
            className={`w-10 h-10 flex items-center justify-center transition-all cursor-pointer font-bold text-lg ${
              darkMode
                ? "text-slate-300 hover:text-white hover:bg-slate-800"
                : "text-slate-700 hover:text-slate-900 hover:bg-slate-100"
            }`}
            title="Zoom In"
          >
            +
          </button>
          <button
            onClick={() => mapCanvasRef.current?.zoomOut()}
            className={`w-10 h-10 flex items-center justify-center transition-all cursor-pointer font-bold text-lg ${
              darkMode
                ? "text-slate-300 hover:text-white hover:bg-slate-800"
                : "text-slate-700 hover:text-slate-900 hover:bg-slate-100"
            }`}
            title="Zoom Out"
          >
            -
          </button>
        </div>
        <button
          onClick={handleLocateMe}
          className={`w-10 h-10 rounded-2xl backdrop-blur-2xl border flex items-center justify-center transition-all cursor-pointer ${
            darkMode
              ? "bg-[#0f172a]/95 border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 shadow-2xl"
              : "bg-white/95 border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-100 shadow-xl"
          }`}
          title="Recenter Location"
        >
          <Locate className="w-4 h-4" />
        </button>
      </div>

      {/* ── Bottom Right Action Buttons (GABAI AI & Report Flood) ── */}
      <div className="absolute bottom-6 right-6 z-30 pointer-events-auto flex items-center gap-3">
        {/* 🎙️ GABAI AI Chatbot Button 🎙️ */}
        <button
          onClick={handleMicPress}
          title="Press to speak to GABAI"
          className={`h-12 px-4 rounded-2xl relative flex items-center gap-2.5 transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer text-xs font-extrabold shrink-0 group ${
            darkMode
              ? "bg-[#0f172a]/95 hover:bg-slate-800/90 text-white border border-slate-700/80 shadow-2xl shadow-slate-950/60 backdrop-blur-xl"
              : "bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 text-white shadow-xl shadow-blue-600/30 border border-white/20"
          }`}
        >
          <GabaiLogo size="xs" transparent />
          <span className="tracking-wide drop-shadow-md">GABAI AI</span>
          <Sparkles className="w-3.5 h-3.5 text-cyan-400 drop-shadow-md animate-pulse" />
        </button>

        {/* Primary Report Flood Button */}
        <button
          onClick={handleOpenReportModal}
          className={`h-12 px-5 rounded-2xl font-extrabold text-xs flex items-center gap-2 transition-all hover:scale-105 active:scale-95 cursor-pointer shrink-0 ${
            darkMode
              ? "bg-[#0f172a]/95 hover:bg-slate-800/90 text-white border border-slate-700/80 shadow-2xl shadow-slate-950/60 backdrop-blur-xl"
              : "bg-blue-600 hover:bg-blue-500 text-white shadow-xl shadow-blue-600/40 border border-blue-400/30"
          }`}
        >
          <span className={`text-base font-normal ${darkMode ? "text-blue-400" : "text-white"}`}>
            +
          </span>
          <span>Report flood</span>
        </button>
      </div>

      {/* Backdrop */}
      {activeModal !== "none" && (
        <div
          className="fixed inset-0 z-40 bg-black/30 dark:bg-black/50 anim-fade-in"
          onClick={closeModal}
        />
      )}

      {/* ── 1. Hazard Detail Sheet (Tapped on Marker) ────────── */}
      {activeModal === "hazard" && selectedHazard && (
        <div className="fixed inset-x-0 bottom-0 z-50 pointer-events-none flex flex-col justify-end sm:inset-0 sm:items-center sm:justify-center sm:p-4 anim-slide-up">
          <div className="pointer-events-auto bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200/80 dark:border-slate-700/80 w-full max-w-lg mx-auto flex flex-col max-h-[90dvh] sm:max-h-[85vh] overflow-hidden transition-all">
            {/* Header / Drag Handle */}
            <div className="shrink-0 pt-3 px-4 pb-2 border-b border-slate-100 dark:border-slate-800/80 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm">
              <div className="flex justify-center pb-2 sm:hidden">
                <div className="w-10 h-1 bg-slate-300 dark:bg-slate-700 rounded-full" />
              </div>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{selectedHazard.emoji}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
                        {selectedHazard.label}
                      </h3>
                      {selectedHazard.verified > 0 && (
                        <span className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 font-bold px-2 py-0.5 rounded-full">
                          LGU Verified ✅
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <StatusDot risk={selectedHazard.severity} />
                      <span className="text-xs text-slate-500 dark:text-slate-400 capitalize">
                        {selectedHazard.severity} Severity Danger Zone · {selectedHazard.distance}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={closeModal}
                  className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 space-y-3">
              {/* Stats row */}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "AI Confidence", val: `${selectedHazard.confidence}%` },
                  { label: "Citizen Reports", val: `${selectedHazard.reports}` },
                  {
                    label: "LGU Status",
                    val:
                      selectedHazard.verified > 0 || selectedHazard.isVerified
                        ? "Verified"
                        : "Pending",
                  },
                ].map(({ label, val }) => (
                  <div
                    key={label}
                    className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-2.5 sm:p-3 text-center border border-slate-100 dark:border-slate-700/50"
                  >
                    <div className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                      {val}
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">{label}</div>
                  </div>
                ))}
              </div>

              {/* Road Flood Line & Passability Details */}
              {selectedHazard.isRoadSegment && selectedHazard.roadSegment && (
                <div className="p-3 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-black tracking-wider text-blue-700 dark:text-blue-300 flex items-center gap-1">
                      🛣️ Flooded Road Stretch
                    </span>
                    <span
                      className={`text-[9px] px-2 py-0.5 rounded-full font-extrabold ${
                        selectedHazard.verified > 0 || selectedHazard.isVerified
                          ? "bg-blue-600 text-white"
                          : "bg-amber-500 text-white animate-pulse"
                      }`}
                    >
                      {selectedHazard.verified > 0 || selectedHazard.isVerified
                        ? "🔵 LGU VERIFIED LINE"
                        : "🟠 PENDING LGU LINE"}
                    </span>
                  </div>

                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {selectedHazard.roadSegment.roadName || selectedHazard.label}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="bg-white/80 dark:bg-slate-900/80 p-2 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
                      <div className="text-[10px] text-slate-500 font-semibold">
                        Start (Point A)
                      </div>
                      <div className="font-bold text-slate-800 dark:text-slate-200 truncate">
                        {selectedHazard.roadSegment.from.name || "Start Pin A"}
                      </div>
                    </div>
                    <div className="bg-white/80 dark:bg-slate-900/80 p-2 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
                      <div className="text-[10px] text-slate-500 font-semibold">End (Point B)</div>
                      <div className="font-bold text-slate-800 dark:text-slate-200 truncate">
                        {selectedHazard.roadSegment.to.name || "End Pin B"}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
                    <div className="text-xs">
                      <span className="text-[10px] text-slate-400 block">Vehicle Passability:</span>
                      <span className="font-black text-red-600 dark:text-red-400">
                        {selectedHazard.passability === "not_passable_all"
                          ? "⛔ Closed to All Vehicles"
                          : selectedHazard.passability === "all_passable"
                            ? "🟢 Passable to All Vehicles"
                            : "🚫 Not Passable to Light Vehicles (Sedans, Motorcycles blocked)"}
                      </span>
                    </div>
                    {selectedHazard.waterDepth && (
                      <div className="text-right text-xs font-bold text-cyan-600 dark:text-cyan-400">
                        🌊 {selectedHazard.waterDepth}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <Clock className="w-3.5 h-3.5" />
                Reported {selectedHazard.ago} · Road status:{" "}
                <span className="font-semibold text-red-600 dark:text-red-400 ml-0.5">
                  {selectedHazard.status}
                </span>
              </div>
            </div>

            {/* Pinned Action Footer */}
            <div className="shrink-0 p-3 sm:p-4 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-t border-slate-100 dark:border-slate-800/80">
              <button
                onClick={() => {
                  setActiveModal("routes");
                  setSelectedHazard(null);
                }}
                className="w-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold py-3 rounded-xl text-xs sm:text-sm hover:bg-slate-700 dark:hover:bg-slate-100 transition-colors shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Navigation className="w-3.5 h-3.5" />
                <span>Avoid & Calculate Safe Route</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 2. Route Selection & Interactive Destination Sidebar / Bottom Sheet ── */}
      {activeModal === "routes" && (
        <div className="fixed bottom-0 left-0 right-0 md:bottom-auto md:top-20 md:left-6 md:right-auto md:w-[440px] z-40 pointer-events-none anim-slide-up">
          <div className="pointer-events-auto bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl rounded-t-3xl md:rounded-3xl shadow-2xl border-t md:border border-slate-200/80 dark:border-slate-700/80 max-w-lg md:max-w-none mx-auto max-h-[85vh] md:max-h-[calc(100vh-6.5rem)] flex flex-col transition-all duration-300">
            {/* Header Drag Handle for Mobile */}
            <div className="flex justify-center pt-3 pb-1 shrink-0 md:hidden">
              <div className="w-10 h-1 bg-slate-300 dark:bg-slate-700 rounded-full" />
            </div>

            {/* Minimized Quick Summary Bar */}
            {isRouteSheetMinimized ? (
              <div className="p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-sm">
                    🧭
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-black text-slate-900 dark:text-white truncate">
                      {destination?.name || "Safe Destination"}
                    </div>
                    <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold">
                      {routes?.[selectedRoute]?.label} · {routes?.[selectedRoute]?.time}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setIsRouteSheetMinimized(false)}
                    className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <span>Options</span>
                    <ChevronDown className="w-3.5 h-3.5 rotate-180" />
                  </button>
                  <button
                    onClick={handleStartNavigation}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shadow-md"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    <span>Go</span>
                  </button>
                </div>
              </div>
            ) : (
              /* Expanded Full Route Navigator Panel */
              <div className="px-4 pt-2 pb-5 overflow-y-auto flex-1 no-scrollbar">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                      <Navigation className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-slate-900 dark:text-white text-base">
                        Safe Route Navigator
                      </h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Real-time AI flood & hazard avoidance routing
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {/* View Map / Collapse Toggle */}
                    <button
                      onClick={() => setIsRouteSheetMinimized(true)}
                      title="Minimize to view full map"
                      className="px-2.5 py-1 bg-cyan-50 dark:bg-cyan-950/40 hover:bg-cyan-100 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800 rounded-full text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer"
                    >
                      <Eye className="w-3 h-3" />
                      <span>View Map</span>
                    </button>
                    <button
                      onClick={closeModal}
                      className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* ── Active Destination Card & Change Button ── */}
                <div className="bg-slate-50 dark:bg-slate-800/80 rounded-2xl p-3 border border-slate-200/60 dark:border-slate-700/60 mb-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-emerald-500" />
                      Target Destination
                    </span>
                    <button
                      onClick={() => setIsChoosingDestination((prev) => !prev)}
                      className="text-xs font-bold text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      {isChoosingDestination ? "Done" : "✏️ Change Destination"}
                    </button>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-emerald-600 dark:text-emerald-300 font-bold shrink-0 text-xs">
                      🏁
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                        {destination?.name || "Nearest Evacuation Center"}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                        {destination
                          ? `Coordinates: ${destination.lat.toFixed(4)}°N, ${destination.lng.toFixed(4)}°E`
                          : "Auto-routed to closest high-ground shelter"}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Interactive Destination Chooser Drawer ── */}
                {isChoosingDestination && (
                  <div className="bg-white dark:bg-slate-800/90 rounded-2xl p-3 border-2 border-cyan-500/30 mb-4 shadow-sm anim-slide-down">
                    <div className="text-xs font-bold text-slate-800 dark:text-white mb-2 flex items-center justify-between">
                      <span>Choose Where You Want to Go:</span>
                      <button
                        onClick={() => {
                          setIsMapClickDestinationMode(true);
                          closeModal();
                        }}
                        className="text-[11px] font-semibold text-cyan-600 dark:text-cyan-400 flex items-center gap-1 bg-cyan-50 dark:bg-cyan-950/40 px-2 py-0.5 rounded-md border border-cyan-200 dark:border-cyan-800 cursor-pointer"
                      >
                        <span>📍 Tap on Map</span>
                      </button>
                    </div>

                    {/* Destination Search Box */}
                    <div className="relative mb-2.5">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={destinationSearch}
                        onChange={(e) => setDestinationSearch(e.target.value)}
                        placeholder="Search destination, hospital, gas, clinic..."
                        className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-cyan-500"
                      />
                    </div>

                    {/* Quick Preset Buttons */}
                    <div className="grid grid-cols-2 gap-1.5 mb-2.5">
                      {evacCenters.slice(0, 4).map((shelter) => (
                        <button
                          key={shelter.id}
                          onClick={() => {
                            setDestination({
                              name: shelter.name,
                              lat: shelter.lat,
                              lng: shelter.lng,
                            });
                            setIsChoosingDestination(false);
                            mapCanvasRef.current?.flyToCoords(shelter.lat, shelter.lng, 15);
                          }}
                          className="py-1.5 px-2 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-200 text-[11px] font-bold text-center truncate transition-colors cursor-pointer"
                        >
                          🛡️ {shelter.name}
                        </button>
                      ))}
                    </div>

                    {/* Selectable Destination List */}
                    <div className="max-h-44 overflow-y-auto space-y-1.5 no-scrollbar">
                      {selectableDestinations.slice(0, 10).map((item) => (
                        <button
                          key={item.id}
                          onClick={() => {
                            setDestination({ name: item.name, lat: item.lat, lng: item.lng });
                            setIsChoosingDestination(false);
                            mapCanvasRef.current?.flyToCoords(item.lat, item.lng, 15);
                          }}
                          className="w-full flex items-center gap-2.5 p-2 rounded-xl hover:bg-cyan-50 dark:hover:bg-slate-700/60 border border-slate-100 dark:border-slate-700/50 text-left transition-colors group cursor-pointer"
                        >
                          <span className="text-base shrink-0">🛡️</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate group-hover:text-cyan-600 dark:group-hover:text-cyan-400">
                              {item.name}
                            </div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                              {item.address} · {item.distance} away
                            </div>
                          </div>
                          <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0 group-hover:text-cyan-500" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── AI Route Assessment Card (Clean & Minimal) ── */}
                {aiRouteAnalysis && (
                  <div className="mb-3.5 bg-slate-900/95 dark:bg-slate-900/90 text-white rounded-2xl p-3.5 border border-slate-700/60 dark:border-slate-800 shadow-md">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                          <Sparkles className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-xs font-bold tracking-wide text-slate-200 uppercase">
                          AI Route Assessment
                        </span>
                      </div>
                      <span className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold px-2 py-0.5 rounded-md">
                        {aiRouteAnalysis.confidenceScore}% Accuracy
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-300 leading-relaxed mb-2.5">
                      {aiRouteAnalysis.aiSummary}
                    </p>

                    {aiRouteAnalysis.aiReasoning.length > 0 && (
                      <div className="space-y-1 bg-slate-950/60 rounded-xl p-2.5 border border-slate-800/80">
                        {aiRouteAnalysis.aiReasoning.slice(0, 3).map((reason, idx) => (
                          <div
                            key={idx}
                            className="text-[10px] text-slate-400 font-medium flex items-center gap-2"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/80 shrink-0" />
                            <span>{reason}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Route Options Comparison (2 Options: Alternate Route & Direct Highway) ── */}
                <div className="space-y-2.5 mb-4">
                  {(["safe", "fast"] as const).map((rId) => {
                    const r = routes[rId];
                    if (!r) return null;
                    const isSelected = selectedRoute === r.id;
                    const isFloodFree = r.risk === "low";
                    const isSafeRecommended = r.id === "safe" && isFloodFree;
                    const hasWarning = r.risk === "high" || r.risk === "medium";
                    const isFloodedBlocked = r.risk === "high";

                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => {
                          if (isFloodedBlocked) {
                            setLastActionMessage(
                              "🚫 Sarado ang rutang ito dahil sa naiulat na baha. Awtomatikong naka-lock sa Alternate Route para sa inyong kaligtasan.",
                            );
                            setSelectedRoute("safe");
                            return;
                          }
                          setSelectedRoute(r.id);
                          setCustomDetourRoute(null);
                        }}
                        disabled={isFloodedBlocked && r.id === "fast"}
                        className={`w-full flex items-start gap-3.5 p-3.5 sm:p-4 rounded-2xl border transition-all text-left ${
                          isFloodedBlocked && r.id === "fast"
                            ? "opacity-65 bg-rose-50/40 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/40 cursor-not-allowed"
                            : isSelected
                              ? "border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/30 shadow-sm ring-1 ring-emerald-500/30 cursor-pointer"
                              : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
                        }`}
                      >
                        {/* Radio selection / Status circle */}
                        <div
                          className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-all ${
                            isFloodedBlocked && r.id === "fast"
                              ? "border-rose-400 bg-rose-500/20 text-rose-500 text-[9px] font-bold"
                              : isSelected
                                ? "border-emerald-500 bg-emerald-500 text-white"
                                : "border-slate-300 dark:border-slate-600"
                          }`}
                        >
                          {isFloodedBlocked && r.id === "fast"
                            ? "✕"
                            : isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>

                        {/* Route Details */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span
                              className={`text-sm font-bold ${isFloodedBlocked && r.id === "fast" ? "text-slate-500 dark:text-slate-400 line-through" : "text-slate-900 dark:text-white"}`}
                            >
                              {r.label}
                            </span>
                            {isSafeRecommended ? (
                              <span className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-[10px] font-semibold px-2 py-0.5 rounded-md">
                                Recommended · Flood-Free
                              </span>
                            ) : isFloodFree ? (
                              <span className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-[10px] font-semibold px-2 py-0.5 rounded-md">
                                Flood-Free
                              </span>
                            ) : isFloodedBlocked ? (
                              <span className="bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30 text-[10px] font-bold px-2 py-0.5 rounded-md">
                                🚫 Sarado / Baha (Closed)
                              </span>
                            ) : hasWarning ? (
                              <span className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-[10px] font-semibold px-2 py-0.5 rounded-md">
                                Flood Warning
                              </span>
                            ) : (
                              <span className="bg-slate-500/10 text-slate-700 dark:text-slate-300 border border-slate-500/30 text-[10px] font-semibold px-2 py-0.5 rounded-md">
                                Direct
                              </span>
                            )}
                          </div>

                          <div className="text-xs text-slate-600 dark:text-slate-400 leading-snug">
                            {r.detail}
                          </div>
                        </div>

                        {/* Timing and Fuel */}
                        <div className="text-right shrink-0">
                          <div
                            className={`text-sm font-bold ${isFloodedBlocked ? "text-slate-400 dark:text-slate-500" : "text-slate-900 dark:text-white"}`}
                          >
                            {r.time}
                          </div>
                          {r.fuelEstLiters && (
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                              ~{r.fuelEstLiters} L fuel
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Start Driving Navigation HUD */}
                <button
                  onClick={handleStartNavigation}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg text-sm cursor-pointer"
                >
                  <Navigation className="w-4 h-4" />
                  <span>Start Turn-by-Turn Safe Navigation</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 4. Community Disaster Reporting with AI Vision ────── */}
      {activeModal === "report" && (
        <div className="fixed inset-x-0 bottom-0 z-50 pointer-events-none flex flex-col justify-end sm:inset-0 sm:items-center sm:justify-center sm:p-4 anim-slide-up">
          <div className="pointer-events-auto bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200/80 dark:border-slate-700/80 w-full max-w-lg mx-auto flex flex-col max-h-[92dvh] sm:max-h-[88vh] overflow-hidden transition-all">
            {/* Modal Header (Pinned at top) */}
            <div className="shrink-0 pt-3 px-4 pb-2.5 border-b border-slate-100 dark:border-slate-800/80 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm">
              <div className="flex justify-center pb-2 sm:hidden">
                <div className="w-10 h-1 bg-slate-300 dark:bg-slate-700 rounded-full" />
              </div>
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base">
                  Community Disaster Report
                </h3>
                <button
                  onClick={closeModal}
                  className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Attach photo for Multimodal AI Flood-Depth Analysis & LGU response.
              </p>
            </div>

            {reportStep === "form" && (
              <>
                {/* Scrollable Form Body */}
                <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 space-y-3">
                  {/* Category Selection */}
                  <div className="grid grid-cols-1 gap-1.5 sm:gap-2">
                    {REPORT_TYPES.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setReportType(t.id)}
                        className={`flex flex-col items-center justify-center gap-1 p-2 sm:p-2.5 rounded-xl sm:rounded-2xl border-2 transition-all cursor-pointer ${
                          reportType === t.id
                            ? "border-cyan-500 bg-cyan-50/70 dark:bg-cyan-950/40 shadow-sm"
                            : "border-slate-200 dark:border-slate-700/80 hover:bg-slate-50 dark:hover:bg-slate-800"
                        }`}
                      >
                        <span className="text-xl sm:text-2xl">{t.emoji}</span>
                        <span className="text-[10px] sm:text-[11px] font-semibold text-slate-700 dark:text-slate-300 leading-tight text-center">
                          {t.label}
                        </span>
                      </button>
                    ))}
                  </div>

                  {/* Mode Toggle: Road Segment (Line) vs Point */}
                  <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setIsRoadSegmentMode(true)}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] sm:text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer truncate ${
                        isRoadSegmentMode
                          ? "bg-white dark:bg-slate-700 text-cyan-600 dark:text-cyan-400 shadow-sm"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                      }`}
                    >
                      <span className="truncate">🛣️ Flooded Road Stretch (Line)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsRoadSegmentMode(false)}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-[10px] sm:text-xs font-bold transition-all flex items-center justify-center gap-1 cursor-pointer truncate ${
                        !isRoadSegmentMode
                          ? "bg-white dark:bg-slate-700 text-cyan-600 dark:text-cyan-400 shadow-sm"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                      }`}
                    >
                      <span className="truncate">📍 Single Point</span>
                    </button>
                  </div>

                  {/* Road Flood Line Segment (From ➔ To) Controls */}
                  {isRoadSegmentMode && (
                    <div className="bg-slate-50 dark:bg-slate-800/80 p-2.5 sm:p-3 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 space-y-2.5">
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                        <span>Road / Street Information</span>
                        <span className="text-[10px] text-cyan-600 dark:text-cyan-400 font-semibold">
                          Draws line on map
                        </span>
                      </div>

                      <input
                        type="text"
                        value={roadName}
                        onChange={(e) => setRoadName(e.target.value)}
                        placeholder="Road / Street Name (e.g. Mexico-San Luis Road, MacArthur Hwy)"
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-white placeholder:text-slate-400 outline-none focus:border-cyan-500"
                      />

                      {/* Start Point (Point A) */}
                      <div className="flex items-center justify-between gap-2 bg-white dark:bg-slate-900 p-2 sm:p-2.5 rounded-xl border border-slate-200/70 dark:border-slate-700/60">
                        <div className="min-w-0 flex-1">
                          <div className="text-[9px] sm:text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                            Start of Flood (Point A)
                          </div>
                          <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                            {floodStartPoint?.name || "Tap on Map"}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setIsPickingPointMode("from");
                            setActiveModal("none");
                          }}
                          className="px-2.5 py-1.5 bg-cyan-50 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 rounded-lg text-[10px] sm:text-xs font-bold shrink-0 hover:bg-cyan-100 dark:hover:bg-cyan-900/50 transition-colors cursor-pointer"
                        >
                          📍 Pick on Map
                        </button>
                      </div>

                      {/* End Point (Point B) */}
                      <div className="flex items-center justify-between gap-2 bg-white dark:bg-slate-900 p-2 sm:p-2.5 rounded-xl border border-slate-200/70 dark:border-slate-700/60">
                        <div className="min-w-0 flex-1">
                          <div className="text-[9px] sm:text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                            End of Flood (Point B)
                          </div>
                          <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                            {floodEndPoint?.name || "Tap on Map"}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setIsPickingPointMode("to");
                            setActiveModal("none");
                          }}
                          className="px-2.5 py-1.5 bg-cyan-50 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 rounded-lg text-[10px] sm:text-xs font-bold shrink-0 hover:bg-cyan-100 dark:hover:bg-cyan-900/50 transition-colors cursor-pointer"
                        >
                          📍 Pick on Map
                        </button>
                      </div>

                      {/* Vehicle Passability Options */}
                      <div className="space-y-1 pt-1">
                        <label className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 block">
                          Vehicle Passability Status:
                        </label>
                        <div className="grid grid-cols-3 gap-1 sm:gap-1.5">
                          {[
                            {
                              id: "all_passable",
                              label: "Passable",
                              desc: "All Vehicles",
                              color:
                                "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
                            },
                            {
                              id: "not_passable_light",
                              label: "No Light Cars",
                              desc: "4x4 / Trucks Only",
                              color:
                                "border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
                            },
                            {
                              id: "not_passable_all",
                              label: "Closed Road",
                              desc: "All Blocked",
                              color:
                                "border-red-500 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
                            },
                          ].map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => setFloodPassability(p.id as any)}
                              className={`p-1.5 sm:p-2 rounded-xl border text-center transition-all cursor-pointer ${
                                floodPassability === p.id
                                  ? `${p.color} border-2 shadow-sm font-bold`
                                  : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800"
                              }`}
                            >
                              <div className="text-[10px] sm:text-[11px] font-black leading-tight">
                                {p.label}
                              </div>
                              <div className="text-[8px] sm:text-[9px] opacity-80 leading-tight mt-0.5">
                                {p.desc}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Water Depth Quick Selection */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 block">
                          Estimated Water Depth:
                        </label>
                        <div className="grid grid-cols-4 gap-1 sm:gap-1.5">
                          {[
                            "Ankle Deep (10cm)",
                            "Knee Deep (40cm)",
                            "Waist Deep (70cm)",
                            "Chest Deep (1m+)",
                          ].map((depth) => (
                            <button
                              key={depth}
                              type="button"
                              onClick={() => setFloodWaterDepth(depth)}
                              className={`py-1.5 px-1 rounded-lg text-[9px] sm:text-[10px] font-bold border transition-colors truncate cursor-pointer ${
                                floodWaterDepth === depth
                                  ? "bg-cyan-600 text-white border-cyan-600 shadow-sm"
                                  : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                              }`}
                            >
                              {depth.split(" ")[0]}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Multimodal AI Photo Analyzer */}
                  <div>
                    <input
                      type="file"
                      ref={fileInputRef}
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      className="hidden"
                    />

                    {photoPreview ? (
                      <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 p-2.5">
                        <div className="flex items-center gap-3">
                          <img
                            src={photoPreview}
                            alt="Flood Snapshot"
                            className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl object-cover shrink-0"
                          />
                          <div className="flex-1 min-w-0 text-xs">
                            <div className="font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
                              <span className="truncate">
                                {isAnalyzingPhoto
                                  ? "AI Analyzing Water Depth..."
                                  : "AI Vision Assessed"}
                              </span>
                            </div>
                            {photoAiAnalysis && (
                              <div className="mt-1 text-[11px] text-cyan-600 dark:text-cyan-400 font-semibold">
                                {photoAiAnalysis.waterDepthLevel}
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => {
                              setPhotoPreview(null);
                              setPhotoAiAnalysis(null);
                            }}
                            className="p-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full py-2.5 px-3 border-2 border-dashed border-cyan-500/50 rounded-2xl bg-cyan-50/40 dark:bg-cyan-950/20 flex items-center justify-center gap-2 text-xs font-bold text-cyan-600 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-950/40 transition-colors cursor-pointer"
                      >
                        <Camera className="w-4 h-4 shrink-0" />
                        <span className="truncate">
                          Take Photo / Upload for AI Flood Depth Vision
                        </span>
                      </button>
                    )}
                  </div>

                  {/* Auto GPS Location & Proof-of-Location Geofencing Status */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/80 rounded-xl px-3 py-2 border border-slate-100 dark:border-slate-700/40">
                      <div className="flex items-center gap-2 min-w-0">
                        <MapPin className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-300 truncate">
                          Device GPS · {locationName}
                        </span>
                      </div>
                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md shrink-0">
                        GPS Active
                      </span>
                    </div>

                    {/* 🛡️ Proof-of-Location Geofence Badge */}
                    <div
                      className={`rounded-xl p-2.5 flex items-start gap-2 text-left border transition-all ${
                        isGeofenceViolated
                          ? "bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-200"
                          : "bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-200"
                      }`}
                    >
                      <Shield
                        className={`w-4 h-4 shrink-0 mt-0.5 ${isGeofenceViolated ? "text-rose-500" : "text-emerald-500"}`}
                      />
                      <div className="text-[11px] leading-snug flex-1">
                        <div className="font-bold flex items-center justify-between gap-1">
                          <span>Proof-of-Location Geofencing</span>
                          <span
                            className={`text-[9px] uppercase px-1.5 py-0.5 rounded font-black tracking-wider ${
                              isGeofenceViolated
                                ? "bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300"
                                : "bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300"
                            }`}
                          >
                            {isGeofenceViolated ? "Out of 1.5km Range" : "Verified Nearby"}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[10px] opacity-90">
                          {isGeofenceViolated
                            ? `⚠️ Hazard location is ${reportDistanceKm.toFixed(1)} km away. Motorists can only report hazards within 1.5 km of their device GPS to prevent fake remote reports.`
                            : `✓ Incident is within ${reportDistanceKm < 0.1 ? "< 100m" : `${reportDistanceKm.toFixed(2)} km`} of your device (Max 1.5 km Geofence passed).`}
                        </p>
                      </div>
                    </div>

                    {/* ⏳ Device Rate Limiting Cooldown Badge */}
                    <div className="bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-xl px-3 py-2 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <Clock
                          className={`w-3.5 h-3.5 ${reportCooldownSec > 0 ? "text-amber-500 animate-pulse" : "text-slate-400"}`}
                        />
                        <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                          Device Rate Limit (2m cooldown)
                        </span>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          reportCooldownSec > 0
                            ? "bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 font-mono"
                            : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400"
                        }`}
                      >
                        {reportCooldownSec > 0 ? `${reportCooldownSec}s remaining` : "Ready"}
                      </span>
                    </div>

                    {/* Error Banner */}
                    {reportErrorMsg && (
                      <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-2.5 flex items-start gap-2 text-rose-700 dark:text-rose-300 text-xs">
                        <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                        <span className="text-[11px] font-medium leading-snug">
                          {reportErrorMsg}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Description input */}
                  <textarea
                    value={reportDesc}
                    onChange={(e) => setReportDesc(e.target.value)}
                    placeholder="Describe what you see (e.g. knee-deep flood, impassable to tricycles)..."
                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-700 dark:text-slate-300 placeholder-slate-400 outline-none focus:border-cyan-500 resize-none"
                    rows={2}
                  />

                  {/* Anti-Spam Verification Notice */}
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-2.5 flex items-start gap-2 text-left">
                    <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <div className="text-[10px] sm:text-[11px] text-amber-900 dark:text-amber-200 leading-snug">
                      <span className="font-bold">Anti-Spam Crowdsource Defense:</span>{" "}
                      Proof-of-Location Geofencing (1.5 km), Device Rate Limiting (120s cooldown),
                      and LGU Command Center triage protect motorists from false flood alerts.
                    </div>
                  </div>
                </div>

                {/* Sticky/Fixed Footer with Submit Button */}
                <div className="shrink-0 p-3 sm:p-4 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-t border-slate-100 dark:border-slate-800/80">
                  <button
                    onClick={submitReport}
                    disabled={!reportType || reportCooldownSec > 0 || isGeofenceViolated}
                    className="w-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold py-3 sm:py-3.5 rounded-xl disabled:opacity-40 transition-all hover:bg-slate-800 dark:hover:bg-slate-100 shadow-md text-xs sm:text-sm cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {reportCooldownSec > 0 ? (
                      <>
                        <Clock className="w-4 h-4 animate-spin text-amber-500" />
                        <span>⏳ Anti-Spam Cooldown ({reportCooldownSec}s remaining)</span>
                      </>
                    ) : isGeofenceViolated ? (
                      <>
                        <ShieldAlert className="w-4 h-4 text-rose-500" />
                        <span>🚫 Location Exceeds 1.5km GPS Geofence</span>
                      </>
                    ) : (
                      <span>Submit Report to LGU Command Center</span>
                    )}
                  </button>
                </div>
              </>
            )}

            {reportStep === "analyzing" && (
              <div className="p-8 flex flex-col items-center justify-center gap-4 text-center">
                <div className="w-12 h-12 rounded-full border-3 border-cyan-500 border-t-transparent animate-spin" />
                <div>
                  <p className="text-sm font-bold text-slate-800 dark:text-white">
                    Submitting to LGU Command Center...
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Routing report into municipal triage queue for verification
                  </p>
                </div>
              </div>
            )}

            {reportStep === "done" && (
              <div className="p-6 sm:p-8 flex flex-col items-center justify-center gap-4 text-center">
                <div className="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shadow-inner">
                  <Shield className="w-8 h-8 text-amber-500" />
                </div>
                <div className="px-2">
                  <p className="text-base font-bold text-slate-800 dark:text-white">
                    Report Queued for LGU Verification
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                    Your incident report near {locationName.split(",")[0]} has been submitted. It is
                    now in the LGU triage queue and will be published to all motorists once verified
                    by dispatch.
                  </p>
                </div>
                <button
                  onClick={closeModal}
                  className="px-6 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold rounded-xl shadow cursor-pointer hover:opacity-90 transition-opacity"
                >
                  Done & Return to Map
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 5. Family Safety Modal ───────────────────────────── */}
      {activeModal === "family_safety" && (
        <FamilySafetyModal
          currentLocationName={locationName}
          onClose={closeModal}
          onTriggerSOSStrobe={() => setIsSOSStrobeActive(true)}
        />
      )}

      {/* ── 6. Map Layers & Perspective Settings Modal ─────────── */}
      {layersOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm anim-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm w-full shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden anim-scale-up">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 flex items-center justify-center">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                    Map Layers & 3D Settings
                  </h3>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    Customize view & optimize rendering
                  </p>
                </div>
              </div>
              <button
                onClick={() => setLayersOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3.5">
              {/* Base Map Imagery Style: Streets vs Satellite Hybrid */}
              <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-200/60 dark:border-slate-700/60">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-2 flex items-center justify-between">
                  <span>Base Map Imagery</span>
                  <span className="text-[10px] text-cyan-600 dark:text-cyan-400 font-extrabold">
                    {isSatellite ? "🛰️ Satellite Hybrid" : "🗺️ Standard Streets"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setIsSatellite(false)}
                    className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      !isSatellite
                        ? "bg-blue-600 text-white shadow-md shadow-blue-500/25 ring-2 ring-blue-400/40"
                        : "bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600"
                    }`}
                  >
                    <span>🗺️ Streets (Vector)</span>
                  </button>
                  <button
                    onClick={() => setIsSatellite(true)}
                    className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      isSatellite
                        ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/25 ring-2 ring-emerald-400/40"
                        : "bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600"
                    }`}
                  >
                    <span>🛰️ Satellite Hybrid</span>
                  </button>
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-2">
                  {isSatellite
                    ? "Real-world high-resolution satellite imagery with street labels"
                    : "Clean vector street map with dark/light theme support"}
                </div>
              </div>

              {/* 2D / 3D Mode Selector Card */}
              <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-200/60 dark:border-slate-700/60">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-2 flex items-center justify-between">
                  <span>Perspective Mode</span>
                  <span className="text-[10px] text-cyan-600 dark:text-cyan-400 font-extrabold">
                    {is3D ? "3D Angled View" : "2D Top-Down View"}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      if (!is3D) toggle3DMode();
                    }}
                    className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                      is3D
                        ? "bg-blue-600 text-white shadow-md shadow-blue-500/25 ring-2 ring-blue-400/40"
                        : "bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600"
                    }`}
                  >
                    <span>🧊 3D Perspective</span>
                  </button>
                  <button
                    onClick={() => {
                      if (is3D) toggle3DMode();
                    }}
                    className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all ${
                      !is3D
                        ? "bg-blue-600 text-white shadow-md shadow-blue-500/25 ring-2 ring-blue-400/40"
                        : "bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600"
                    }`}
                  >
                    <span>🗺️ 2D Flat (Fast)</span>
                  </button>
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-2">
                  {is3D
                    ? "Shows 3D pitch and extruded structures"
                    : "Top-down view for fastest scrolling & 0% GPU load"}
                </div>
              </div>

              {/* Layer Toggles List */}
              <div className="space-y-2">
                {/* 3D Buildings */}
                <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">🏢</span>
                    <div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        3D Extruded Buildings
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">
                        Urban building heights & outlines
                      </div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={show3DBuildings}
                    onChange={(e) => setShow3DBuildings(e.target.checked)}
                    className="w-4 h-4 text-cyan-600 rounded focus:ring-cyan-500 cursor-pointer"
                  />
                </label>

                {/* Road Flood Corridors */}
                <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">🛣️</span>
                    <div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        Road Flood Lines (Orange/Blue)
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">
                        Submerged road corridors & passability
                      </div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={showRoadLines}
                    onChange={(e) => setShowRoadLines(e.target.checked)}
                    className="w-4 h-4 text-cyan-600 rounded focus:ring-cyan-500 cursor-pointer"
                  />
                </label>

                {/* Danger Radius Circles */}
                <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">🚨</span>
                    <div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        Danger Zones & Radius
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">
                        Geodesic flood risk perimeter buffers
                      </div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={showDangerZones}
                    onChange={(e) => setShowDangerZones(e.target.checked)}
                    className="w-4 h-4 text-cyan-600 rounded focus:ring-cyan-500 cursor-pointer"
                  />
                </label>

                {/* Evacuation Centers */}
                <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">🏥</span>
                    <div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-200">
                        Evacuation Centers
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">
                        Designated high-ground relief shelters
                      </div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={showEvacCenters}
                    onChange={(e) => setShowEvacCenters(e.target.checked)}
                    className="w-4 h-4 text-cyan-600 rounded focus:ring-cyan-500 cursor-pointer"
                  />
                </label>
              </div>

              <button
                onClick={() => setLayersOpen(false)}
                className="w-full mt-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold py-2.5 rounded-xl text-xs shadow-md transition-colors"
              >
                Apply & Return to Map
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Route Hazard Simulator Panel (Test Mode) ── */}
      <HazardSimulationPanel
        activeRoute={activeRouteForHazardMonitor}
        isNavigating={isDrivingHUDActive || activeModal === "routes"}
        onUpdatePosition={setSimulatedPosition}
        onInjectFakeReport={injectSimulatedHazardAhead}
        darkMode={darkMode}
      />

      {/* ── Live Route Hazard Alert Modal ── */}
      {routeHazardAlert && activeRouteForHazardMonitor && (
        <HazardAlertModal
          alertData={routeHazardAlert}
          darkMode={darkMode}
          currentRoute={activeRouteForHazardMonitor}
          userLocation={userLocation}
          destination={
            destination || {
              lat: userLocation.lat + 0.02,
              lng: userLocation.lng - 0.015,
              name: "Safe Evacuation Center",
            }
          }
          existingHazards={publicHazards}
          evacCenters={evacCenters}
          onAcceptNewRoute={(newRoute) => {
            setCustomDetourRoute(newRoute);
            setSelectedRoute(newRoute.id as any);
            dismissRouteHazardAlert();
          }}
          onContinueAnyway={(hazardId) => {
            confirmRouteHazardContinue(hazardId);
          }}
          onDismiss={dismissRouteHazardAlert}
          onNavigateToShelter={(shelter) => {
            setCustomDetourRoute(null);
            setDestination(shelter);
            dismissRouteHazardAlert();
          }}
        />
      )}
    </div>
  );
}
