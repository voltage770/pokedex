#!/usr/bin/env bash
# Generates all PNG variants of the lightning-star icon from the source SVGs
# and copies the transparent SVGs to app/public/ as favicons.
#
# Run from anywhere:
#   bash /Users/jackson/Documents/projects/pokedex/design/icons/convert-icons.sh
#
# Requires: librsvg (`brew install librsvg`)
#
# Source SVGs live here in design/icons/ (not deployed). Generated PNGs +
# favicon SVGs go into ../../app/public/ which is what gets shipped to
# GitHub Pages.

set -e
cd "$(dirname "$0")"
OUT=../../app/public

# prod (yellow X)
rsvg-convert -w 180 -h 180 prod-lightning-star.svg -o $OUT/apple-touch-icon-prod.png
rsvg-convert -w 192 -h 192 prod-lightning-star.svg -o $OUT/icon-prod-192.png
rsvg-convert -w 512 -h 512 prod-lightning-star.svg -o $OUT/icon-prod-512.png

# prod (yellow X, white bg — light-mode variant)
rsvg-convert -w 180 -h 180 prod-lightning-star-white-bg.svg -o $OUT/apple-touch-icon-prod-light.png
rsvg-convert -w 192 -h 192 prod-lightning-star-white-bg.svg -o $OUT/icon-prod-light-192.png
rsvg-convert -w 512 -h 512 prod-lightning-star-white-bg.svg -o $OUT/icon-prod-light-512.png

# dev (white X)
rsvg-convert -w 180 -h 180 dev-lightning-star.svg -o $OUT/apple-touch-icon-dev.png
rsvg-convert -w 192 -h 192 dev-lightning-star.svg -o $OUT/icon-dev-192.png
rsvg-convert -w 512 -h 512 dev-lightning-star.svg -o $OUT/icon-dev-512.png

# dev (outline-only on white bg — light-mode variant)
rsvg-convert -w 180 -h 180 dev-lightning-star-white-bg.svg -o $OUT/apple-touch-icon-dev-light.png
rsvg-convert -w 192 -h 192 dev-lightning-star-white-bg.svg -o $OUT/icon-dev-light-192.png
rsvg-convert -w 512 -h 512 dev-lightning-star-white-bg.svg -o $OUT/icon-dev-light-512.png

# transparent favicons (SVG + 32px PNG fallback)
cp prod-lightning-star-transparent.svg $OUT/favicon-prod.svg
cp dev-lightning-star-transparent.svg  $OUT/favicon-dev.svg
rsvg-convert -w 32 -h 32 prod-lightning-star-transparent.svg -o $OUT/favicon-prod-32.png
rsvg-convert -w 32 -h 32 dev-lightning-star-transparent.svg  -o $OUT/favicon-dev-32.png

echo ""
echo "✓ generated 16 files in app/public/"
ls -1 $OUT | grep -E "favicon|icon|apple" | sort
