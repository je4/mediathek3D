# User Navigation & Embedding Guide

Welcome to the **HGK Mediathek 3D Viewer**! This guide explains how to navigate the 3D space, find books and shelf boxes, use camera presets, export snapshots, and embed the viewer in your web portals.

---

## 1. 3D Navigation Controls

| Action | Mouse Control | Touch / Trackpad Control |
|---|---|---|
| **Rotate / Orbit View** | Left Click + Drag | Single Finger Drag |
| **Pan / Move View** | Right Click + Drag | Two-Finger Drag |
| **Zoom In / Out** | Mouse Scroll Wheel | Pinch In / Out |
| **Select & Inspect Box** | Left Click on any shelf box | Tap on any shelf box |

---

## 2. Keyboard Shortcuts

| Shortcut Key | Action |
|---|---|
| <kbd>R</kbd> | **Reset View**: Smoothly returns camera to standard isometric overview |
| <kbd>T</kbd> | **Top View**: Aligns camera directly overhead for 2D floor plan overview |
| <kbd>F</kbd> | **Fullscreen**: Toggles browser fullscreen mode |
| <kbd>/</kbd> | **Search**: Instantly focuses the box search bar |
| <kbd>Esc</kbd> | **Close**: Closes open details drawer, search dropdown, or help modal |

---

## 3. Searching and Locating Shelf Boxes

1. Press <kbd>/</kbd> or click into the **Search** input at the top of the screen.
2. Type any box ID (e.g. `A101`, `K204`) or area name (e.g. `Backoffice`).
3. Use the arrow keys <kbd>↓</kbd> / <kbd>↑</kbd> to navigate through live suggestions and press <kbd>Enter</kbd> to jump.
4. The camera smoothly glides to the target box, highlights it in red, and opens the metadata card with shelf, level, index, and area information.

---

## 4. Camera Matrix State (CamJSON)

The viewer maintains complete backwards compatibility with the legacy Mediathek CamJSON matrix format:
- **View Current Matrix**: Click on the **Camera Matrix** panel in the bottom-left corner to inspect the current 16-element transformation array.
- **Copy Matrix**: Click **Copy** to copy the JSON matrix to your clipboard.
- **Apply Matrix**: Paste any 16-element matrix JSON array into the textarea and press <kbd>Enter</kbd> (or click **Apply**) to immediately restore that exact camera angle and position.

---

## 5. Capturing High-Resolution Screenshots

Click the **Snapshot** button (<kbd>📷</kbd>) in the top HUD toolbar. The application instantly renders a high-DPI frame and downloads a timestamped PNG image (e.g. `mediathek3d-2026-11-21T11-00-00.png`) to your computer.

---

## 6. Embedding in Library Catalogs (Primo, VuFind, Custom Portals)

You can easily embed the 3D viewer directly into item detail views or library catalog pages using an `<iframe>`:

```html
<!-- Example: Embed box A101 in library item view -->
<iframe
    src="https://your-domain.com/embed?box=A101"
    width="100%"
    height="550"
    style="border: none; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.15);"
    allow="fullscreen">
</iframe>
```

When users view a book in the catalog, passing `?box=A101` will automatically highlight the physical shelf box holding that volume and focus the 3D camera right onto it.
