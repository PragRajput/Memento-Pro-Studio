# 🎬 Mini Video Editor

A high-performance, studio-grade browser-based video editor built with **React**, **TypeScript**, and **Vite**. 

All decoding, editing, audio processing, and rendering happen **100% client-side** directly in your browser using **WebCodecs** and **Mediabunny**. Your media files stay on your computer and are never uploaded to any cloud server.

---

## ✨ Features at a Glance

### 🎞️ Multi-Track Timeline & Editing
- **Multi-Track Architecture**: Base video lane, stackable secondary video layers (`V2`, `V3`), multi-lane audio tracks (`A1`, `A2`), dedicated overlay lane (`OV`), and text title lane (`T`).
- **Precision Trimming & Splitting**: Frame-accurate in/out handle trimming, drag-and-drop reordering, and instant playhead splitting (`S`).
- **Smart Timeline Navigation**: Sticky track badges and ruler, zoom controls (10 to 200 px/sec), and an auto-following playhead that smoothly yields when you scroll away.
- **Aspect Ratio Presets**: Switch instantly between **16:9 Landscape**, **9:16 Vertical** (TikTok / Reels / Shorts), **1:1 Square** (Instagram), **4:5 Portrait**, and **21:9 Ultrawide**.

### 🎨 Video Transforms, Color Grading & Filters
- **Spatial Transforms**: 90° / 180° / 270° rotation, horizontal & vertical flipping, and fit mode toggles (`contain` vs `cover`).
- **Variable Playback Speed**: Smooth speed scaling from **0.25× up to 4×** with automatic timeline duration compensation.
- **Color Grading Presets**: 10 distinct cinematic looks (**Normal**, **Cinematic**, **Noir**, **Vintage**, **Sepia**, **Cold Blue**, **Warm Sunset**, **Vibrant**, **Cyberpunk**, **Dreamy**) with fine intensity controls.
- **Keyframe Animation Engine**: Animate transform, opacity, and scale properties over time with custom easing curves (**Linear**, **Ease In/Out**, **Cubic**, **Hold**).

### ⚡ 13 Cinematic Transitions
- **Rich Transition Library**: Crossfade, Fade to Black, Fade to White, Wipes (Left, Right, Up, Down), Slides (Left, Right), Zoom (In, Out), Iris Circle, and Blur Dissolve.
- **Handle-Aware Rendering**: Intelligently rolls head/tail handles from adjacent clips without freezing frames.
- **Interactive Cut Triggers**: Clickable transition chips with duration sliders and easing curve options.

### 🎚️ Multi-Track Audio Engine & DAW Effects
- **Pitch-Responsive Waveforms**: Real-time frequency- and peak-analyzed SVG waveforms displaying dynamic amplitude contours and pitch variations.
- **Web Audio DSP Effects**: Apply studio-grade effects including **Studio Reverb**, **Tape Echo / Delay**, **Bass Boost**, **Treble Boost**, **Radio / Telephone Bandpass**, **Robot / Ring Modulator**, **Chorus / Flanger**, and High/Low-Pass filters.
- **Fade Envelopes & Volume**: Independent clip gain, linear fade-in and fade-out envelope automation.
- **Extended Audio Playback**: When audio tracks exceed video duration, the player smoothly transitions to a clean black screen while the song continues playing to completion.

### 🖼️ Multi-Category Overlay System
- **Picture-in-Picture (PiP) & Logos**: Drag-to-position on preview canvas, quick corner presets, scale slider (10%–90%), rounded corners, border strokes, and synchronized video playback.
- **Visual FX Atmosphere Overlays**: 2.35:1 Cinematic Letterbox Bars, Vignette, 35mm Film Grain, Golden Light Leak, VHS Glitch, CRT Scanlines, and Bokeh Dust with intensity and blend modes (**Screen**, **Multiply**, **Overlay**, **Soft Light**).
- **Broadcast Lower Thirds**: Television-style title banners (**Broadcast Bar**, **Minimal Tag**, **Social Creator Card**, **Breaking News Ribbon**) with editable headlines, subtitles, and accent colors.
- **Color & Gradient Washes**: Atmospheric ambient lighting and dual-tone gradient tints with hardware-accelerated blend modes.

### ✍️ Typography & Titles
- **Curated Google Fonts**: Inter, Anton, Bebas Neue, Montserrat, Playfair Display, Pacifico, Caveat, Dancing Script, Oswald, Space Mono, Impact, and Georgia.
- **Live Canvas Interaction**: Drag titles freely across the preview monitor, customize size, font weight, color, background highlight badges, and opacity.

### 💾 Zero-Loss Auto-Save & History
- **IndexedDB Project Persistence**: Split-storage architecture separating lightweight project metadata from media assets; protects your edits against accidental tab closures or page refreshes.
- **Full Undo / Redo**: Multi-level history stack covering timeline edits, trims, splits, overlays, audio changes, and property adjustments (`Cmd/Ctrl+Z`, `Cmd/Ctrl+Shift+Z`).

### 🚀 Hardware-Accelerated MP4 Export
- **WebCodecs Client-Side Encoding**: Direct MP4 rendering in memory with **H.264 / HEVC / VP9 / AV1** video codecs and **AAC / Opus** audio codecs.
- **1:1 Visual Parity**: All active video filters, transforms, overlays, transitions, text titles, and mixed audio effects render faithfully to export.
- **Progress Tracking & Cancellation**: Real-time rendering percentage feedback with instant abort support.

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Space` | Play / Pause playback |
| `S` | Split clip/item at current playhead position |
| `Del` / `Backspace` | Delete selected clip, audio, title, or overlay |
| `Cmd` / `Ctrl` + `Z` | Undo last edit |
| `Cmd` / `Ctrl` + `Shift` + `Z` or `Ctrl` + `Y` | Redo last edit |
| `?` or `/` | Open Keyboard Shortcuts cheatsheet |
| `Esc` | Close active dialog or modal |

---

## 🛠️ Quick Start

### Prerequisites
- Node.js 18+ (Node 20+ recommended)
- A modern Chromium browser with WebCodecs support (Google Chrome, Microsoft Edge, Brave, Opera)

### Installation & Run

```bash
# Clone the repository
git clone https://github.com/your-username/mini-video-editor.git
cd mini-video-editor

# Install dependencies
npm install

# Start local dev server
npm run dev
```

Open the local development URL (default: `http://localhost:5173`).

---

## 🧪 Available Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Starts Vite local development server with hot-module replacement |
| `npm test` | Runs the test suite via Node's native test runner (`node --test`) |
| `npm run lint` | Lints TypeScript and JSX files with Oxlint |
| `npm run build` | Runs TypeScript compilation (`tsc -b`) and builds production bundle (`vite build`) |
| `npm run preview` | Serves the production build from `dist/` locally for verification |

---

## 🚢 Deployment

The project is configured with relative base resolution (`base: './'`), making it ready for deployment on any static hosting provider.

### GitHub Pages (Automatic via GitHub Actions)
A production deployment workflow is included in `.github/workflows/deploy.yml`.
1. Push the repository to GitHub.
2. In GitHub, go to **Settings** > **Pages**.
3. Under **Build and deployment** > **Source**, choose **GitHub Actions**.

### Vercel / Netlify / Cloudflare Pages
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Node Version**: 18+ (20+ recommended)

---

## 🔒 Privacy & Security

Mini Video Editor is designed around a **local-first, zero-telemetry** architecture. No media, audio, or metadata ever leaves your device. Everything is processed directly within your browser's WebCodecs and Web Audio pipeline.
