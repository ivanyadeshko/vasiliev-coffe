#!/usr/bin/env bash
# ТВ-версия ролика из оригинала Grok (оригиналы — в media-originals/, вне git).
#   bin/encode-tv-video.sh <оригинал.mp4> <выход.mp4> [pingpong] [silent-audio]
#
# - Обрезка до видимой части: витрина 1280×1080 сцены показывает исходник
#   1280×720 через object-fit: cover, прижатым вправо (object-position 100%),
#   то есть только правые 854×720. Декодировать остальную треть кадра незачем.
# - Пиковый битрейт ограничен (VBV): слабому декодеру ТВ не прилетают всплески.
# - Только видео: звук браузер декодирует даже у muted-ролика.
# - pingpong: цикл «вперёд + назад» одним файлом — кадры 0..N и N-1..1,
#   без повторов на стыках; плеер крутит его нативным loop без смены декодера.
# - silent-audio: дорожка тишины. ТВ экрана 2 (WebView Chrome 113) изредка
#   зависает в самом начале беззвучного ролика — со звуком такого не было.
set -euo pipefail
in=$1 out=$2
shift 2
pingpong= audio=(-an)
for opt in "$@"; do
    case $opt in
        pingpong) pingpong=1 ;;
        silent-audio) audio=(-f lavfi -i anullsrc=r=48000:cl=stereo) ;;
        *) echo "неизвестная опция: $opt" >&2; exit 1 ;;
    esac
done

crop='crop=854:720:426:0'
if [ -n "$pingpong" ]; then
    vf="[0:v:0]$crop,split[f][b];[b]reverse,trim=start_frame=1,setpts=PTS-STARTPTS[r0];"
    # у реверса отбрасываем и последний кадр (= первый кадр прямого прохода)
    n=$(ffprobe -v error -select_streams v:0 -count_frames -show_entries stream=nb_read_frames -of csv=p=0 "$in")
    vf+="[r0]trim=end_frame=$((n - 2)),setpts=PTS-STARTPTS[r];[f][r]concat=n=2:v=1:a=0[v]"
else
    vf="[0:v:0]$crop[v]"
fi

if [ "${audio[0]}" = -an ]; then amap=(-an); else amap=(-map 1:a -c:a aac -b:a 32k -shortest); fi
ffmpeg -v error -y -i "$in" "${audio[@]/#-an/}" -filter_complex "$vf" -map '[v]' "${amap[@]}" \
    -sn -dn -map_metadata -1 \
    -c:v libx264 -preset slow -crf 20 -maxrate 2500k -bufsize 5000k \
    -profile:v high -pix_fmt yuv420p -movflags +faststart "$out"
