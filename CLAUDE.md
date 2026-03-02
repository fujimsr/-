# CLAUDE.md — AI Assistant Guide for This Repository

## Overview

This repository contains **棒人間くじ引き** (Stick Figure Lottery), a self-contained, single-file web lottery/raffle application built with vanilla HTML5, CSS3, and JavaScript. There are no external dependencies, no build tools, and no backend — everything runs entirely in the browser.

## Repository Structure

```
/
├── index.html     # The entire application (28.5 KB) — HTML + CSS + JS in one file
├── index.html2    # Minimal GitHub Pages connectivity test file
└── CLAUDE.md      # This file
```

## Technology Stack

| Layer    | Technology                        |
|----------|-----------------------------------|
| Markup   | HTML5                             |
| Style    | CSS3 (gradients, animations, backdrop-filter) |
| Logic    | Vanilla JavaScript (ES6+)         |
| Graphics | HTML5 Canvas 2D API               |
| Audio    | Web Audio API (no audio files)    |
| Hosting  | GitHub Pages (static, no server)  |

There is **no package.json**, no npm, no bundler, no transpiler, and no test framework.

## Application Description

A fun lottery/raffle app featuring animated stick figures. The user adds items to a pool, clicks "Draw", and watches a slot-machine roller spin before revealing a winner with fireworks and celebration animations.

### Preset Modes
- **おみくじ** (Omikuji) — Traditional fortune slips
- **じゃんけん** (Rock-Paper-Scissors)
- **ランチ** (Lunch options)
- **罰ゲーム** (Penalty game)

### Draw Flow
1. User adds up to 20 items (manually or via preset)
2. Clicks "Draw"
3. Stick figure turns nervous (yellow, shaking animation)
4. Slot roller spins fast (speed 15) for ~1.5 s
5. Roller slows (speed 2) for ~1.5 s
6. Result locks in; stick figure jumps (green, celebration)
7. Result modal appears with shimmering text
8. Fireworks + sparkle particles fire
9. Drawn item is faded/struck through; user can draw again or reset

## Code Organization (inside `index.html`)

The JavaScript inside `index.html` is divided into clearly commented sections:

| Section | Key Globals / Functions |
|---------|------------------------|
| State | `items[]`, `drawnItems[]`, `rollerItems[]`, `phase` |
| Audio | `playTick()`, `playDrumRoll()`, `playFanfare()` |
| Stick figure drawing | `drawStickFigure()`, `drawFace()` |
| Lottery box | `drawLotteryBox()` |
| Slot roller | `animateRoller()` |
| Particle system | `addSparkle()`, `updateSparkles()` |
| Fireworks | `launchFireworks()`, `renderFireworks()` |
| Main render loop | `renderStage()` — uses `requestAnimationFrame` |
| Item management | `addItem()`, `removeItem()`, `resetItems()` |
| Draw logic | `startDraw()` |
| Result display | `showResult()`, `closeResult()` |

## Development Workflow

### Running Locally
Open `index.html` directly in a browser — no server required:
```bash
open index.html          # macOS
xdg-open index.html      # Linux
start index.html         # Windows
```
Or serve with any static server for live reloading:
```bash
npx serve .
python3 -m http.server 8080
```

### Editing
All code lives in `index.html`. Edit it directly. The file has three logical blocks in order:
1. `<style>` — all CSS
2. `<body>` — all HTML markup
3. `<script>` — all JavaScript

### No Build Step
There is no compilation, transpilation, or bundling. Changes are immediately visible on browser refresh.

### No Tests
There is no automated test suite. Verify changes manually in the browser across Chrome, Firefox, and Safari, paying attention to:
- Canvas rendering
- Web Audio API compatibility
- CSS animation performance
- Responsive layout (viewport scaling)

## Key Conventions & Patterns

### Graphics
- All animations use `requestAnimationFrame` loops (`renderStage`, `renderFireworks`)
- Two separate canvases: `#stageCanvas` (700×360 px, stick figures + roller) and `#fireworksCanvas` (full-page, fireworks overlay)
- Immediate-mode rendering — the canvas is fully redrawn every frame
- Coordinate origin for stick figures is their foot position

### State Management
- Simple global variables; no frameworks
- `phase` string drives the main render loop: `"idle"` | `"rolling"` | `"result"`
- Items cap at 20 (`MAX_ITEMS = 20`)

### Audio
- All sounds are synthesized via `AudioContext` — no external audio files
- Sound functions create oscillators on demand and clean up after themselves

### Animations & Timing
- Use `Date.now()` or frame counters for time-based effects (star twinkle, background gradient shift)
- Easing is implemented manually with lerp or custom curves — no animation libraries

### Styling Conventions
- Japanese UI strings are hardcoded in HTML; no i18n layer
- Color scheme: dark background (`#1a1a2e`), vibrant accent colors for items and buttons
- Buttons use CSS gradient + `box-shadow` for a glossy look
- `backdrop-filter: blur` used on the result modal overlay

## Deployment

The app deploys to **GitHub Pages** as a static site. Push `index.html` to the `master` branch (or configure Pages to serve from the relevant branch/folder).

`index.html2` is a minimal sanity-check file used to verify GitHub Pages is serving correctly; it is not part of the application.

## What AI Assistants Should Know

- **Single file** — all changes go into `index.html` unless explicitly restructuring the project
- **No dependencies to install** — never suggest `npm install` unless adding a deliberate new toolchain
- **No build commands** — never suggest `npm run build` or similar
- **No tests to run** — manual browser testing is the verification method
- **Japanese strings** — UI text is in Japanese; preserve it unless specifically asked to translate
- **Canvas coordinate system** — positive Y is downward; stick figure positions are foot-based
- **`MAX_ITEMS` constant** — enforced at 20; respect this limit in any feature additions
- **Web Audio API** — sounds are synthesized, not file-based; keep it that way for the zero-dependency goal
- **Git branch** — active development happens on branches prefixed with `claude/`; `master` is the production/Pages branch
