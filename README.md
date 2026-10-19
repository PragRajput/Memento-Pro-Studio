# Mini Video Editor

A lightweight, high-performance browser-based video editor built with React, TypeScript, and Vite.
All processing and rendering happens client-side directly in your browser using WebCodecs and Mediabunny; video files stay on your computer and are never uploaded to any server.

## Quick Start

```bash
npm install
npm run dev
```

Open the local development URL (usually [http://localhost:5173](http://localhost:5173)) in Chrome, Edge, or another modern Chromium browser supporting WebCodecs.

## Features

- **Media Management**: Import video and audio files via the Import button or drag-and-drop into the Media Bin. Instant thumbnail extraction, duration, and resolution detection.
- **Video Track**:
  - Add clips with `+` or drag them directly into the timeline.
  - Interactive trimming by dragging clip edges.
  - Reorder clips with drag-and-drop.
  - Split clips precisely at the playhead position.
  - Per-clip mute toggles.
- **Multi-Track Audio**:
  - Multiple parallel audio lanes (`A1`, `A2`, etc.) for background music, voiceover, and sound effects.
  - Add extra audio tracks dynamically.
  - Per-item volume sliders and quick mute toggles.
  - In/out trimming and playhead split support.
- **Text & Title Overlays**:
  - Add text overlays at any point in the timeline.
  - Drag-and-drop interactive repositioning directly in the preview player.
  - Customizable typography with curated Google Fonts (Inter, Anton, Bebas Neue, Montserrat, Playfair Display, Pacifico, Caveat, Dancing Script, Oswald, Space Mono, Impact, Georgia).
  - Configurable font sizes, text color, and background highlighting.
- **Timeline Controls**:
  - Smooth timeline scrubbing and ruler navigation.
  - Real-time playhead positioning.
  - Zoom slider for precision editing.
- **Client-Side Export**:
  - Export the timeline directly to an MP4 video file.
  - Hardware-accelerated encoding using WebCodecs (H.264 / HEVC / VP9 / AV1 and AAC / Opus).
  - Progress reporting with live percentage feedback and cancellation support.

### Keyboard Shortcuts

| Key | Action |
| --- | --- |
| `Space` | Play / pause the timeline |
| `S` | Split selected clip or item at the playhead |
| `Delete` / `Backspace` | Remove the selected item (video, audio, or text overlay) |

## Available Scripts

- `npm run dev`: Start the Vite local development server.
- `npm run build`: Typecheck with TypeScript (`tsc -b`) and bundle for production with Vite.
- `npm run lint`: Fast linting with Oxlint.
- `npm run preview`: Locally preview the production build in `./dist`.

## Deployment

The project is structured with portable relative asset resolution (`base: './'`) so it can be deployed to any static host or git platform.

### GitHub Pages (Automatic via GitHub Actions)

A GitHub Actions workflow is provided at `.github/workflows/deploy.yml`.

1. Push this repository to GitHub:
   ```bash
   git remote add origin https://github.com/<your-username>/<your-repo-name>.git
   git branch -M main
   git push -u origin main
   ```
2. In your GitHub repository:
   - Go to **Settings** > **Pages**.
   - Under **Build and deployment** > **Source**, select **GitHub Actions**.
3. Pushes to `main` will automatically build and publish the site.

### Vercel / Netlify / Cloudflare Pages

- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Node Version**: 18+ (Node 20+ recommended)
