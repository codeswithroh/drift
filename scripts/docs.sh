#!/usr/bin/env bash
# Rebuild README / DEV post visuals from the real app.
#   1. screenshots (real models; needs Ollama for Gemma)  2. hero + cover  3. GIF  4. copy to public/press
set -euo pipefail
cd "$(dirname "$0")/.."

[[ "${SKIP_SHOTS:-}" == 1 ]] || SHOTS=1 npx playwright test screenshots --reporter=line
SHOTS=1 npx playwright test hero --reporter=line

# GIF: each light screen held ~2 s, scaled to 360 px wide, with a shared palette.
frames=(1-home-light 2-preparing-light 3-ready-light 4-walking 5-stats-light 6-entry-light 7-notebook-light)
list=$(mktemp)
for f in "${frames[@]}"; do printf "file '%s'\nduration 2.2\n" "$PWD/docs/screens/$f.png" >> "$list"; done
printf "file '%s'\n" "$PWD/docs/screens/${frames[${#frames[@]}-1]}.png" >> "$list"
ffmpeg -loglevel error -y -f concat -safe 0 -i "$list" \
  -vf "scale=360:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=4" \
  -loop 0 docs/drift.gif
rm "$list"

# The DEV post loads its images from the deployed site.
mkdir -p public/press
cp docs/hero.png docs/cover.png docs/drift.gif public/press/
cp docs/screens/*.png public/press/
echo "docs rebuilt: $(ls docs/screens | wc -l | tr -d ' ') screens, hero, cover, gif"
