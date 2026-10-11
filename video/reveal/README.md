# THEESKAPOOO — A Tech Titans Original

64-second landscape product reveal: 1920 × 1080, 24 fps, H.264/AAC MP4. Music and titles only; no voiceover.

## Create the film

Install the project's development dependencies, then run:

```
node video/reveal/render.cjs --stills
node video/reveal/render.cjs
```

The final MP4, cover, contact sheet and scene-marker CSV are in `video/reveal/output/`. Render intermediates are in `video/reveal/build/`. Both directories are excluded from Git.

## Creative provenance

The renderer creates all graphics, animation and music locally. The score is an original procedural composition, with synthesized tones, percussion and transitions. No stock recordings, licensed music, paid services or external footage are used. Typography uses the installed Segoe UI/Arial fonts. Product screens are illustrative motion graphics, labelled as product visualisations; they contain no real student information or payment credentials.

The edit introduces the campus printing problem, reveals THEESKAPOOO, demonstrates document upload, settings, payment choices, the shop queue and collection, then closes on Tech Titans. It does not claim bank-verified payments or guaranteed collection times.

DaVinci Resolve was detected, but desktop control was unavailable. This film was rendered with Sharp and FFmpeg rather than edited inside Resolve. To continue editing there, import the MP4 into a 1920 × 1080 / 24 fps timeline and use `scene-markers.csv` as the cut guide. The original soundtrack is also retained as `build/original-score.wav`.
