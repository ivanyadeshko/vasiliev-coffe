#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../public/assets/fonts"
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
URL="https://fonts.googleapis.com/css2?family=Unbounded:wght@500;600;700&family=Manrope:wght@400;500;600;700&display=swap"
curl -sf -A "$UA" "$URL" -o fonts-src.css
grep -o 'https://fonts.gstatic.com/[^)]*' fonts-src.css | sort -u | while read -r u; do
  curl -sf -o "$(basename "$u")" "$u"
done
sed -E 's#url\(https://fonts.gstatic.com/[^)]*/([^/)]+)\)#url(/assets/fonts/\1)#g' fonts-src.css > fonts.css
rm fonts-src.css
echo "готово: $(ls *.woff2 | wc -l | tr -d ' ') файлов"
