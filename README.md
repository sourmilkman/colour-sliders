# Chroma — Colour Sliders

A small, tactile colour-matching game designed as an installable mobile PWA.

## Run locally

Serve the repository with any static web server. For example:

```sh
npx serve .
```

Open the printed local URL. Service workers and PWA installation require HTTP(S), rather than opening `index.html` directly.

## Gameplay

Use the red, yellow, and blue pigment sliders to recreate the target colour, then tune it with the white and black sliders. Easy mode can optionally reveal a live match percentage between the swatches; it is off by default.

Lock in your guess to score the round as a percentage, where 100% is an exact match. A game lasts ten rounds and the total score is the average round percentage, saved locally when it beats your best.
