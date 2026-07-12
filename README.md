# Chroma — Colour Sliders

A small, tactile RGB colour-matching game designed as an installable mobile PWA.

## Run locally

Serve the repository with any static web server. For example:

```sh
npx serve .
```

Open the printed local URL. Service workers and PWA installation require HTTP(S), rather than opening `index.html` directly.

## Gameplay

Use the red, green, and blue sliders to recreate the target colour. Lock in your guess to score the round. Matches of 90% or better build a score multiplier streak. A game lasts ten rounds and the best score is saved locally.
