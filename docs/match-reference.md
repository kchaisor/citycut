# Match the reference

`npm run match:ref` captures a reference and a target, aligns them, and writes side-by-side evidence so a transition or UI can be tuned until it matches.

```bash
npm run match:ref -- \
  --ref /workspace/citycut-2d-to-3d-transition-demo.mp4 \
  --target https://kchaisor.github.io/citycut/ \
  --start-action citycut --start-event citycut:intro-webgl-ready \
  --interval 100ms --duration 4.5s --out /workspace/matchref-proof
```

## Inputs

- `--ref`, `--target`: a video file (any ffmpeg format) or a URL. A URL is opened in headless Chrome at `--viewport` (default `1440x900`).
- `--start-action` (target) and `--ref-start-action` (ref): `citycut` waits for the selection frame and clicks `Create model`; `click:<selector>`; or `none`.
- `--start-event`: a `window` event used to anchor the capture, for example `citycut:intro-webgl-ready`.
- `--capture-mode stepped|video`: `stepped` (default) installs the Playwright fake clock, pauses it, then advances it `--interval` at a time and screenshots each step. Software WebGL is too slow for real-time capture, and stepping keeps animation time exact. `video` uses Playwright `recordVideo` in real time.
- `--interval` (default `100ms`), `--duration` (analysed window after t=0), `--capture` (video mode length), `--ref-trim` / `--target-trim` (ms skipped at the start of a video file), `--rows` (contact-sheet rows), `--out`.

## Method

- Normalisation: each source is scaled to fit the viewport aspect with letterbox padding, sampled at the interval with ffmpeg, then reduced to 480×300 thumbnails and 180×112 greyscale analysis frames.
- Alignment: for each sequence on its own, t=0 is the first frame whose mean absolute grey difference from frame 0 exceeds `max(3 × baseline noise, noise + 10% of peak)` for two frames in a row.
- Diff score per aligned pair: mean absolute difference (0–1) and the percentage of pixels changed by more than 24/255.
- Motion curve: mean absolute frame-to-frame difference. Segments are runs above `max(3 × 10th percentile, 15% of 90th percentile)`; gaps of one frame merge. Each segment reports start, end, duration, peak, t50, and the best-fit easing (lowest RMSE of normalised cumulative motion against linear, quad, cubic, sine and expo curves).
- Key events: first change and settle time per screen region (top HUD, left, right, bottom, centre), and single-frame pops such as a HUD appearing without animation.

## Outputs

`report.json`, `frames.csv`, `contact-sheet-NN.png` (reference | target | difference ×3), `diff-over-time.png`, and the captured target video.
