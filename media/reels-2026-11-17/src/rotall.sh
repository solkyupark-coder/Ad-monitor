cd /mnt/project-files/ad-monitor/reels-2026-11-17/src
for sz in hanok:1.6 japan:1.15 mexico:1.4 german:1.1 viking:1.1 persian:1.2 newyork:1.1 christmas:1.1; do s=${sz%:*}; z=${sz#*:}
 for k in 1 2 3; do timeout 900 node caprot.mjs $s $z -14 14 21 1000 && break; done; done
echo ROTDONE
