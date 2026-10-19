# Mini Video Editor

A small browser-based video editor built with React, TypeScript and Vite.
Video files stay on your computer; nothing is uploaded.

## Run

```bash
npm install
npm run dev
```

Open the printed URL (usually http://localhost:5173) in Chrome.

## Features so far

- Import video files with the Import button or by dropping them on the Media panel
- Thumbnails, duration and resolution for each clip; click a clip to preview it
- Timeline: add clips with **+** or by dragging them onto the track
- Click or drag on the ruler to move the playhead; Play runs the whole timeline
- Drag a clip's edges to trim it, drag its middle to reorder, Split cuts at the playhead
- Zoom slider for the timeline
- Export: click **Export** to render the timeline to an MP4 file, entirely in the browser

### Keyboard shortcuts

| Key | Action |
| --- | --- |
| Space | Play / pause the timeline |
| S | Split at the playhead |
| Delete / Backspace | Remove the selected timeline item |

## Export

Export renders every clip to H.264 video (falling back to another codec your browser
supports if needed) and AAC audio (Opus if AAC is unavailable), muxed into one MP4.
Rendering happens on your computer; nothing is uploaded. Click Export, review the
output size and length, then Start export; you can cancel while it runs.

- A clip without usable audio contributes silence, so timing stays in sync.
- The output keeps the first timeline clip's shape, scaled down to 1080p if larger.
- Very large timelines or 4K+ footage will take correspondingly longer to render.

## Planned

Text titles, transitions, and a separate audio track for music or voice-over.
