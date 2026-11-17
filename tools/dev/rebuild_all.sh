#!/bin/bash
# rebuild every resort; real DEMs where they are on disk, otherwise the stored terrain
S=/tmp/claude-0/-home-user-WeSki/8c611e3b-9843-5ffb-a79e-28166bcb6a10/scratchpad; D=$S/data/dem; O=$S/data/new
cd /home/user/WeSki
dems(){ case $1 in
 les-contamines) echo $D/contamines.tif;; geto-kogen) echo $D/geto.tif;; la-plagne) echo $D/laplagne.tif $D/laplagne_e.tif $D/laplagne_s.tif;;
 les-arcs) echo $D/lesarcs.tif;; pizol) echo $D/pizol.tif;; saalbach) echo $D/saalbach.tif;; skiwelt) echo $D/skiwelt.tif;;
 tignes-val-disere) echo $D/tignes.tif;; val-thorens) echo $D/valthorens.tif $D/valthorens_s.tif $D/valthorens_w.tif $D/valthorens_w2.tif;;
 zermatt) echo $D/zermatt.tif $D/zermatt_w.tif $D/zermatt_s.tif $D/zermatt_it.tif;;
 copper-mountain) echo $D/cop_*.tif;; heavenly) echo $D/hv_*.tif;; keystone) echo $D/key_*.tif;; steamboat) echo $D/sb_*.tif;; winter-park) echo $D/wp_*.tif;;
 *) python3 tools/dem_from_built.py $S/rb/before/$1 $S/rb/$1.tif >/dev/null && echo $S/rb/$1.tif;; esac; }
while read id b; do
  [ -n "$ONLY" ] && [[ " $ONLY " != *" $id "* ]] && continue
  f=$O/$b.osm; [ -e $f ] || f=$S/data/$b.osm; [ $b = jay ] && f=$S/data/osm.xml
  echo "=== $id"
  python3 tools/build_data.py tools/resorts/$id.json $f public/data/$id $(dems $id) 2>&1 | grep -E 'left out|outlined|not reachable|holes|Error|error|assert|Traceback|^trails' | cut -c1-900 || echo FAILED
  python3 tools/build_extras.py public/data/$id 2>&1 | tail -1
  python3 tools/build_zones.py tools/resorts/$id.json $f public/data/$id
done < $S/zmap.txt
python3 tools/build_index.py public/data >/dev/null; python3 tools/build_globe.py public/data > /dev/null
