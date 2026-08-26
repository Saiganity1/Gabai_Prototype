GABAI — AI Disaster Intelligence & Safer Navigation
Simplified, production-ready web app prompt (v2)

Design a clean, production-ready, responsive WEB APP for GABAI — an AI-powered disaster intelligence and safer-navigation tool.

Core principle: this should feel like opening Google Maps — not a sci-fi command center. The map is the app. Everything else (AI voice, hazard info, reporting) sits on top of the map as small, unobtrusive UI — the way Waze or Google Maps layers search bars, chips, and buttons over the map itself.

TAGLINE: "Know the danger. Find the safer way."

VISUAL STYLE — keep it simple, not "premium"
Real map styling — should genuinely look like a map (Google Maps / Waze-level realism), not a stylized 3D digital twin or isometric city render.
No glassmorphism, no heavy glow effects, no futuristic sci-fi orb visuals.
Clean flat UI: white/light surfaces, soft shadows, thin borders — like a normal, trustworthy consumer app.
Navy/charcoal only for small UI accents (header, buttons, active states) — not the dominant interface color.
Accent color: cyan/teal for GABAI/AI elements only (mic button, AI chat bubbles).
Status colors: 🔴 Red = danger, 🟡 Amber = warning, 🟢 Green = safe/verified.
Rounded cards, simple icons, clear typography (Inter/SF Pro-style). Nothing oversized or theatrical.
Goal: looks like an app that could ship today, not a concept render.

Simple GABAI logo — should read as "guidance + safety," not "AI sci-fi brand."

Dark mode & light mode
App must support both a light mode (white/light gray map + surfaces, dark text) and a dark mode (charcoal/navy map + surfaces, light text) — same pattern as Google Maps' theme toggle.
Small sun/moon toggle in the top bar (near search or settings), always visible.
Map style itself should also switch — light basemap for light mode, dark basemap for dark mode — not just the UI chrome.
Status colors (red/amber/green) and the cyan AI accent stay consistent and readable in both modes.
Default to system preference on first load; user can override and it should persist.
SCREEN 1 — LANDING (short, optional)

Minimal landing page, not cinematic.

GABAI logo, top left
Headline: "Know the danger. Find the safer way."
Subtext: "Real-time disaster intelligence to help you get home safely."
One CTA: Enter GABAI
Small static map preview image in the background or side — no animated particles/data lines.

Keep this screen fast — most users should land straight on the map.

SCREEN 2 — MAIN APP (this is 90% of the product)

Layout: full-screen real map, Google Maps style. No three-zone dashboard, no big center AI orb.

Map (fills the whole screen)
Standard top-down map view (2D by default; 3D buildings optional toggle only, not the default).
Shows: user location, roads, hazard zones (flood/fire/closures), evacuation centers, safer route lines.
Hazard zones shown as simple colored overlays/pins (red/amber/green), like how Google Maps shows traffic or Waze shows incidents — not glowing 3D volumes.
Top: search bar — "Where do you want to go?" — same placement/style as Google Maps search.
Small floating controls (bottom-right, like Google Maps): Locate Me, Layers, Zoom +/−.
Small floating status chip (top area, near search): 🟢 Area Status: Low Risk.
AI Voice — centered, but still simple
A floating mic button sits at the bottom-center of the map, front and center — this is the one deliberately prominent element in an otherwise plain map UI. Think: a single well-designed circular button, not a giant glowing orb or dashboard centerpiece.
Idle state: clean circular button with a mic icon, resting on the map, small drop shadow. Subtle breathing/pulse only, nothing loud.
Tap/hold to activate → button transitions into a compact listening state (thin animated waveform ring around the button), stays the same size — it should never take over the screen.
When GABAI responds, show a small chat bubble/card that slides up from the bottom, anchored just above the mic button (like a Maps "place card"), not a full takeover.
Everything AI-related stays anchored to that one center button — no separate large AI panel or orb elsewhere on screen.

Example bubble:

GABAI "Flooding detected 800m ahead. I recommend the alternate route — it avoids 3 flooded roads."

[Use Safer Route] [View Hazard]

Example voice prompts (shown as small suggestion chips near the mic, optional):

"Is it safe to go home?"
"Find me a safer route."
"What's happening around me?"
Intelligence panel — collapsible, not always-on
A slim sidebar (desktop) or bottom sheet (narrow screens) that the user can expand/collapse — default to collapsed or minimized so the map stays the focus.
When expanded, shows nearby hazards as simple list cards:
🌊 Flooding — 0.8 km away — 94% confidence
🚧 Road Closure — 1.2 km away — Officially verified
🌧️ Heavy Rain — expected in 30 min
Each card: severity, distance, source/verification, confidence %.
Bottom quick actions — simple button bar

Small floating bar, bottom of screen (like Maps' "Directions / Search nearby" chips):

Find Safer Route
Report Hazard
Evacuation Centers
Emergency

Each opens a simple modal/bottom sheet — no full-page navigation.

INTERACTION — Safer Route

User searches a destination or asks GABAI.

Map shows route options as a simple list/card, similar to how Google Maps shows route alternatives:

🟢 Safest — 18 min — avoids 3 flood zones
🟡 Balanced — 16 min — moderate risk
🔴 Fastest — 14 min — passes 1 high-risk area

Safest route highlighted by default (thicker/colored line on map). Others shown as thinner gray lines — no glowing 3D paths.

GABAI chat bubble: "I recommend the safer route — it's 4 minutes longer but avoids the flooded area ahead."

CTA: Start Navigation

INTERACTION — Hazard Detail

Tapping a hazard pin opens a simple bottom sheet/card (like tapping a place on Google Maps) — plain white card, shadow, no glass blur:

🌊 Flash Flood — 0.8 km ahead — 🔴 High Risk — 94% AI confidence 17 citizen reports · 2 official confirmations · reported 4 min ago Road status: Not Recommended

[Avoid Area] [View Safer Route]

INTERACTION — Report Hazard

Simple modal, mobile-form style:

Help protect your community.

Category buttons (simple icon + label grid): 🌊 Flood · 🚧 Road Blocked · 🔥 Fire · ⚡ Power Outage · 🧍 Person in Danger · ⚠️ Other

Auto-attached location (📍 shown, editable)
Optional photo upload
Short description field
Severity selector

CTA: Submit Report

After submit: simple progress state (Analyzing → Verifying → Published), then confirmation text + confidence score. Keep this quick, not a heavy animated sequence.

INTERACTION — Emergency Mode

When a severe hazard is nearby, the map view adapts (not a full takeover):

Red banner at top: "🔴 Emergency detected — severe flooding 1.2 km from your location."
Danger radius shown on the map as a simple red circle/overlay.
Bottom action bar switches to large, simple buttons:
Find Safe Route
Nearest Evacuation Center
Emergency Contact
Report Emergency

Keep everything readable, high-contrast, minimal text — this state should look calmer and clearer than the design in v1, not more dramatic.

SCREEN 3 — LGU Command Center (separate, internal tool)

Keep this one more "dashboard-like" since it's for trained personnel, but still flat/clean — not glassmorphism:

Map (same real-map style, not 3D digital twin) showing active incidents, flood areas, citizen reports, response teams, evacuation centers.
Right panel: Active Incidents list — severity, location, reports, AI confidence, verification status.
Admin actions: Verify, Reject, Update Severity, Broadcast Alert.
Bottom stats bar: Active Hazards | Verified Reports | People at Risk | Evacuation Capacity.
UX PRIORITIES
Map-first — the app should feel usable in under 2 seconds, like opening Google Maps.
Small, quiet AI presence — mic button and chat bubble, not a dominant AI centerpiece.
Real map look — realistic cartography, not stylized 3D/isometric city art.
No glassmorphism, no heavy glow/neon, no cinematic animation for its own sake.
Modals and bottom sheets over full pages.
Clear states: loading, empty, success, emergency — all simple and legible.
Should look shippable today, not like a concept pitch render.

One-line brief for the designer/AI: "Google Maps, but it also quietly tells you what's dangerous and talks to you through a small mic button — clean, real, and simple, not futuristic."