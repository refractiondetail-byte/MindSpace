# MindSpace — Architecture & Rules

## Core Vision
A local-first, cross-platform 3D spatial "Second Brain" running on Web (PWA), Android (Capacitor), and Linux Desktop (Tauri).

## Strict Architectural Separation (NEVER violate)
1. **Data Layer (`src/core/`)**: Pure TypeScript. Zero Three.js or UI imports.
   - Everything is a `ThoughtNode`: `{ id, title, content, type, region, tags, attachments, moodScore, createdAt, links[] }`.
   - `region` values: `'prefrontal'` (plans/goals/motivation), `'hippocampus'` (schoolwork/notes/files), `'limbic'` (mood/feelings/reflections), `'parietal'` (projects/ideas).
   - Storage uses IndexedDB (via Dexie.js) so it works offline on Pixel and PC, with an abstract `SyncAdapter` interface for cloud sync later.
2. **Spatial 3D Engine (`src/worlds/`)**: Pure Three.js / React Three Fiber.
   - Reads `ThoughtNode[]` and renders them according to the active `WorldTheme` (`'brain'`, `'galaxy'`, `'oled-void'`).
   - Adding a new 3D world skin MUST only require adding a new theme renderer in `src/worlds/`, never touching `src/core/`.
3. **UI Overlay (`src/ui/`)**: Minimal glassmorphic HUD (search bar, quick brain-dump input, node inspector drawer, theme switcher, light/dark/pure-OLED `#000000` theme support).

## Tech Stack
- Vite + React + TypeScript + Tailwind CSS
- Three.js + @react-three/fiber + @react-three/drei
- Dexie.js (IndexedDB) + vite-plugin-pwa
