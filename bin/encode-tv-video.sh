#!/usr/bin/env bash
# ТВ-версия ролика из оригинала Grok (оригиналы — в media-originals/, вне git).
#   bin/encode-tv-video.sh <оригинал.mp4> <выход.mp4> [silent-audio]
#
# - Обрезка до видимой части: витрина 1280×1080 сцены показывает исходник
#   1280×720 через object-fit: cover, прижатым вправо (object-position 100%),
#   то есть только правые 854×720. Декодировать остальную треть кадра незачем.
# - Пиковый битрейт ограничен (VBV): слабому декодеру ТВ не прилетают всплески.
# - По умолчанию только видео: звук браузер декодирует даже у muted-ролика.
# - Циклы — только «вперёд»: Grok reference_to_video с одним и тем же кадром
#   в first_frame и last_frame. Реверс (вперёд + назад) не делаем: мёд течёт
#   вверх, пар уходит обратно в чашку — смотрится неестественно.
# - silent-audio: дорожка тишины. ТВ экрана 2 (WebView Chrome 113) изредка
#   зависает в самом начале беззвучного ролика — со звуком такого не было.
set -euo pipefail
in=$1 out=$2
shift 2
ain=() aout=(-an)
for opt in "$@"; do
    case $opt in
        silent-audio) ain=(-f lavfi -i anullsrc=r=48000:cl=stereo)
                      aout=(-map 1:a -c:a aac -b:a 32k -shortest) ;;
        *) echo "неизвестная опция: $opt" >&2; exit 1 ;;
    esac
done

vf='[0:v:0]crop=854:720:426:0[v]'

ffmpeg -v error -y -i "$in" ${ain[@]+"${ain[@]}"} -filter_complex "$vf" -map '[v]' "${aout[@]}" \
    -sn -dn -map_metadata -1 \
    -c:v libx264 -preset slow -crf 20 -maxrate 2500k -bufsize 5000k \
    -profile:v high -pix_fmt yuv420p -movflags +faststart "$out"
