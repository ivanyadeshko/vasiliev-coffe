#!/usr/bin/env bash
# Делает из постеров плавные видеолупы (медленный зум туда-обратно, 20 с).
# Временное решение, пока ролики Grok Imagine недоступны: последний кадр
# равен первому — луп бесшовный. Использование: ./bin/make-kenburns.sh
set -euo pipefail
cd "$(dirname "$0")/.."
FRAMES=600  # 20 с × 30 fps
for i in 1 2 3 4; do
  src="public/assets/img/screen-$i.jpg"
  out="public/assets/video/screen-$i-a.mp4"
  [ -f "$src" ] || { echo "нет $src"; continue; }
  ffmpeg -y -loglevel error -loop 1 -i "$src" -frames:v "$FRAMES" -filter_complex \
    "scale=3840:-2,zoompan=z='1+0.08*(1-abs(2*on/$FRAMES-1))':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=$FRAMES:s=1280x720:fps=30,format=yuv420p" \
    -c:v libx264 -preset medium -crf 23 -movflags +faststart -an "$out"
  echo "готово: $out ($(du -h "$out" | cut -f1 | tr -d ' '))"
done
