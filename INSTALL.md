# OSINT TRACKING — Installation Guide

## Overview
OSINT Tracking is a fully local, offline-capable military intelligence mapping application.
No server, no API keys, no internet required after the initial tile load.

---

## Requirements
- Any modern browser (Chrome, Edge, Firefox)
- The `OSINT-Gotham/` folder — that's it

## File Structure
```
OSINT-Gotham/
├── index.html        ← Open this to launch the app
├── app.js            ← Main application logic
├── style.css         ← Catppuccin Mocha tactical theme
├── data.js           ← ICBM silo / installation data adapter
├── intel_db.js       ← LOCAL DATABASE (243 military installations + ICBM silos)
└── INSTALL.md        ← This file
```

---

## Quick Start

### Windows
1. Copy the entire `OSINT-Gotham/` folder to your machine
2. Double-click `index.html` → opens in default browser
3. Done

### macOS / Linux
```bash
open OSINT-Gotham/index.html
# or
xdg-open OSINT-Gotham/index.html
```

### VS Code Live Server (recommended)
1. Install the **Live Server** extension
2. Right-click `index.html` → **Open with Live Server**
3. App runs at `http://localhost:5500`

---

## Database: intel_db.js

All data is self-contained in `intel_db.js`. No external files needed.

### Contents
| Array | Count | Description |
|---|---|---|
| `malmstromInventory` | 220 | 341st MW silos — Malmstrom AFB, MT |
| `minotInventory` | 165 | 91st MW silos — Minot AFB, ND |
| `warrenInventory` | 220 | 90th MW silos — F.E. Warren AFB, WY/CO/NE |
| `globalMilIntelligence` | 243 | Global military installations |

### Installation Types (globalMilIntelligence)
| Type | Count | Description |
|---|---|---|
| `air` | 134 | Air force bases, airfields |
| `army` | 47 | Army bases, camps |
| `bunker` | 20 | Strategic command bunkers |
| `naval` | 27 | Naval stations |
| `marine` | 11 | Marine corps bases |
| `radar` | 2 | Radar / early warning sites |
| `comms` | 2 | Strategic communications |

### Adding New Installations
Open `intel_db.js` and append to the `globalMilIntelligence` array:
```js
{ name: "SITE NAME", lat: 00.0000, lng: 000.0000, type: "air",
  unit: "Unit Name", aircraft: "Aircraft Type", info: "Notes" }
```

---

## Map Controls

| Action | Control |
|---|---|
| Pan | Click + drag |
| Zoom | Scroll wheel or pinch |
| Select feature | Click on marker |
| Measure distance | FAB → Draw → Line |
| Draw area | FAB → Draw → Polygon / Rectangle / Circle |
| Add point | FAB → ADD → Point (supports photo attachment) |
| Add OSINT stamp | FAB → ADD → Stamp |
| Toggle layers | FAB → VIEW → Satellite / Street / Dark |
| Toggle silos | FAB → LYR → Silos button |
| Toggle bases | FAB → LYR → Bases button |
| Toggle grid | FAB → LYR → Grid button |
| Search locations | Bottom panel search bar |

---

## Offline Use

The app loads map tiles from CDN on first use. Once tiles are cached by the browser,
the app works fully offline at previously visited zoom levels.

Tile sources (no API key required):
- **Satellite**: Esri World Imagery
- **Street**: OpenStreetMap
- **Dark**: CartoDB Dark Matter

---

## Deploying to Another Machine

1. Copy the entire `OSINT-Gotham/` folder
2. Open `index.html` in a browser
3. User markers/stamps are saved to `localStorage` on that machine

> Data placed in `intel_db.js` is shared with anyone who receives the folder.
> User markers saved to localStorage are local to that browser/machine only.

---

## Transferring User Markers

User markers are stored in `localStorage` under the key `gotham_markers`.

**Export** (browser console):
```js
copy(localStorage.getItem('gotham_markers'))
```

**Import** on another machine (browser console):
```js
localStorage.setItem('gotham_markers', '<paste here>'); location.reload();
```
