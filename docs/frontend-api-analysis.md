# GABAI Frontend API Analysis

**Date:** 2026-08-23
**Status:** Baseline inspection complete

## 1. Existing Frontend Routes
The frontend is a single-page application built with React + Vite. It does **not** use `react-router`.
Navigation is handled by a state variable in `App.tsx` (`AppScreen`):
- `'landing'`: `LandingPage.tsx`
- `'main'`: `MainDashboardPage.tsx`

> Note: The `'lgu'` screen (`LGUDashboardPage.tsx`) was removed as part of this step to enforce separation of concerns.

## 2. Existing API Requests
**Zero.** There are no `fetch()`, `axios`, or React Query calls in the frontend codebase. All dynamic behaviors are currently simulated using `setTimeout`.

## 3. Expected Request Bodies
Since there are no API calls, there are no existing request bodies. However, based on the UI forms, the backend will need to accept:
- **Hazard Reports:** Type (flood, fire, etc), location (lat, lng), severity (low/medium/high), description.
- **AI Prompts:** Text string from voice-to-text.

## 4. Expected Response Structures
Based on hardcoded constants in `MapCanvas.tsx` and `constants/index.ts`, the frontend expects:

**Hazards Array:**
```json
[
  {
    "id": 1,
    "type": "flood",
    "emoji": "🌊",
    "label": "Flash Flood",
    "lat": 14.585,
    "lng": 120.975,
    "severity": "high",
    "confidence": 94,
    "distance": "0.8 km",
    "reports": 17,
    "verified": 2,
    "ago": "4 min ago",
    "status": "Not Recommended"
  }
]
```

**Routes Array:**
```json
[
  {
    "id": "safe",
    "label": "Safest",
    "time": "18 min",
    "detail": "Avoids 3 flood zones",
    "risk": "low"
  }
]
```

## 5. Existing Authentication Requirements
**Zero.** There is currently no authentication context, JWT handling, or user session state in the frontend.

## 6. Existing WebSocket Requirements
**Zero.** Real-time features (like AI voice and hazard updates) are simulated locally.

## 7. Existing Environment Variables
**Zero.** No `.env` files or `import.meta.env` references exist in the Vite project.

## 8. Missing Backend Endpoints
To make the frontend fully functional without mock data, the following endpoints must be built in future steps:
- `GET /api/hazards` (Get active hazards in radius)
- `POST /api/reports` (Submit a new hazard report)
- `GET /api/evacuation-centers` (Get nearby centers)
- `POST /api/ai/query` (Send user voice query, receive actionable AI response)
- `POST /api/routes/safe` (Calculate safest route avoiding hazards)
- Real-time WebSockets for live hazard broadcasts.
