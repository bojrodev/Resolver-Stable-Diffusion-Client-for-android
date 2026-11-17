# Docs screenshots

The screenshots in `../assets/img/shots/` are taken from the real app (`www/index.html`) by `capture.mjs`, so they can be
retaken whenever the app's look changes.

```
node docs/html/tools/capture.mjs                      # all screenshots
node docs/html/tools/capture.mjs gen-                 # only those whose names contain "gen-"
node docs/html/tools/capture.mjs "prep-images|^history$"   # a pattern: several at once
```

- Needs Node 22+ and Chrome or Edge (found automatically; or set `CHROME=/path/to/chrome`).
- Runs Chrome headless with a throwaway profile at phone size (412 × 892, 2× pixels). It only reads the app: nothing in
  `www/` changes, and no settings or images on the PC are touched.
- Each screenshot is one entry in `shots.mjs`: a name, the JavaScript that puts the app in the right state (which tab,
  which model, what's open), and optionally a CSS selector to capture one element, a finger drag (`drag` / `dragOn`),
  `keep` (carry on from the shot before) or `prep` (a step only, such as making images or queueing jobs).
- Two passes: first the app as installed (not connected), then connected to `mock-forge.mjs`, a pretend Forge on
  127.0.0.1 that only runs while capturing. It answers with example checkpoints, LoRAs (with artwork thumbnails),
  samplers and styles; "generates" drawn landscape PNGs with the settings written into them, as Forge does, so History,
  Queue and Analyze have content; and answers as a small LLM server for Magic Prompt.
- Config shows `http://192.168.1.20` / `7860` instead of the pretend server's address (on screen only).

## The docs' own copies of app code

`../assets/js/promptpaint.js` (prompt colors) and `../assets/js/wcengine.js` (the wildcard engine) are copied unchanged
from `www/js/promptcolors.js` and `www/js/wcengine.js`, so the docs' playgrounds behave exactly as the app. Copy them
again when those change.
