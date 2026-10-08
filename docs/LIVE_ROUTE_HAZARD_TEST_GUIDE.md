# GABAI Live Route Hazard Alert — Test Guide

This guide walks through verifying the **Live Route Hazard Alert** feature in GABAI with a simulated moving user and a fake flood report.

---

## 🚀 Quick Interactive Test via UI

1. **Start Route Navigation**:
   - Open GABAI in your browser (`http://localhost:5173` or `$PORT`).
   - Click the search bar pill **"Plan a route..."** or click the navigation arrow.
   - Select any route option (e.g. *Safe*, *Balanced*, or *Fast*).
   - Click **"Start Turn-by-Turn Safe Navigation"** to enter active driving mode.

2. **Open the Test Hazard Mode Tool**:
   - A floating pill titled **"Test Hazard Mode"** appears in the top right.
   - Click **"Test Hazard Mode"** to reveal the simulation panel.

3. **Inject a Fake Flood Report Ahead**:
   - Tap **"Simulate Flood 400m Ahead"**.
   - **Immediately**:
     - 🔊 Dual-tone urgent audio chime plays via Web Audio API.
     - 📳 Tactile vibration sequence triggers (`navigator.vibrate([300, 150, 300, 150, 450])`).
     - 🚨 **HazardAlertModal** pops up:
       > *"Flooded road ahead: MacArthur Highway, 400 m away. Reported Just now by 1 motorists (HIGH SEVERITY)"*
     - 🔴 On the map, the flooded road segment is highlighted in **vivid red** (`#EF4444`).
     - 🌊 A **pulsing red ripple marker** animates at the exact obstruction coordinate on your route.

4. **Verify Interactive Modal Actions**:
   - **Test 1: 15-Second Inaction Timeout**:
     - Allow the 15-second countdown progress bar to expire.
     - Notice that GABAI **never forces** a reroute; instead, it displays a gentle suggestion badge:
       *"Suggested Action: No response in 15 seconds. We recommend tapping Find new route"* and pulses the button.
   - **Test 2: "Find new route"**:
     - Tap **"Find new route"**.
     - GABAI queries the routing engine to detour around the blocked segment.
     - Displays the comparison card:
       - **Current Route (Flooded)**: `Old ETA (e.g. 14 mins)`
       - **New Safe Detour**: `New ETA (e.g. 17 mins · +3m · 100% Flood-Free)`
     - Tap **"Accept New Safe Route"** to switch navigation to the detour and clear the alert.
   - **Test 3: "Continue anyway" Confirmation**:
     - Re-trigger an alert or tap **"Continue anyway"**.
     - An extra caution dialog appears:
       > *"Hazard Caution: Floodwater on [road] may submerge low exhaust pipes or stall engines. Are you sure you want to proceed?"*
     - Tap **"Yes, Continue on This Road Anyway"**.
     - The modal dismisses, and the affected segment **remains highlighted in red** on the map as a persistent hazard indicator.

5. **Test Moving User Progression**:
   - In the Test Hazard Mode panel, click **"Start Moving Along Route"**.
   - The driver position smoothly advances along the route line every 1.8 seconds.
   - GPS debouncing (3-5 seconds or 20 meters) automatically filters out micro-jitter.

---

## 🧪 Browser Console / Programmatic Test Snippet

You can also trigger a real-time flood report directly via the browser developer console:

```javascript
// Post a live cross-tab realtime flood report directly on the active road
const syncChannel = new BroadcastChannel('gabai-sync-channel');
syncChannel.postMessage({
  type: 'REPORT_SUBMITTED',
  report: {
    id: 'console-flood-' + Date.now(),
    citizen: 'Barangay Emergency Watch',
    type: 'flood',
    emoji: '🌊',
    desc: 'Flash flood on MacArthur Highway. Impassable for light vehicles.',
    lat: 15.039,
    lng: 120.684,
    severity: 'high',
    time: 'Just now',
    status: 'pending',
    locationName: 'MacArthur Highway',
    isRoadSegment: true,
    roadSegment: {
      from: { lat: 15.035, lng: 120.681, name: 'San Fernando Junction' },
      to: { lat: 15.044, lng: 120.688, name: 'Dolores Intersection' },
      roadName: 'MacArthur Highway',
      path: [
        [120.6810, 15.0350],
        [120.6840, 15.0390],
        [120.6880, 15.0440],
      ]
    },
    passability: 'not_passable_light',
    waterDepth: 'Knee Deep (0.45m)'
  }
});
```

---

## 🛡️ Edge Cases Handled

1. **GPS Denied / Lost**:
   - `useRouteHazardMonitor` listens to `watchPosition` error callbacks (`PERMISSION_DENIED`, `POSITION_UNAVAILABLE`).
   - Gracefully marks `gpsStatus: 'denied' | 'lost'` and uses last known coordinates without interrupting the UI.
2. **Debouncing**:
   - Spatial evaluation is debounced to 3.5 seconds or 20 meters movement to preserve mobile device battery and prevent calculation thrashing.
3. **Offline Operation**:
   - Spatial evaluations with Turf.js are executed 100% client-side in memory.
   - Flood reports are cached in `localStorage` (`gabai-live-reports`, `gabai-live-hazards`).
   - Web Audio API tone synthesis works with zero external network requests.
4. **No Alternate Safe Route Found**:
   - If all surrounding corridors are submerged, the rerouter falls back to displaying the nearest evacuation center / safe highland point (`San Fernando Evacuation Center · 1.4 km`) with a **"Divert to Safe Evacuation Shelter"** button and local emergency hotlines (911, Pampanga PDRRMO Rescue) with tap-to-call.
