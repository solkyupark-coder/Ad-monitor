# frames go to a local folder (the shared folder is slow to write); languages run side by side
S=/mnt/project-files/ad-monitor/reels-2026-11-17/src; W=${W:-/tmp/claude-0/bgmrender}; mkdir -p $W; cd $W
for l in $LANGS; do ( rm -rf out_$l; PAGE=reel13.html node $S/render.mjs $l > r$l.log 2>&1
ffmpeg -v error -y -framerate 30 -i out_$l/%04d.jpg -i $S/music-mix.wav -c:v libx264 -pix_fmt yuv420p -crf 18 -preset medium -c:a aac -b:a 192k -shortest -movflags +faststart reel-bgm-$l.mp4 && cp reel-bgm-$l.mp4 $S/../ ; echo $l $(ls out_$l|wc -l) ) & done; wait; echo ALLDONE
