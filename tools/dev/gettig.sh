cd /tmp/claude-0/-home-user-WeSki/8c611e3b-9843-5ffb-a79e-28166bcb6a10/scratchpad; until grep -q OSMDONE osm2.log; do sleep 5; done
python3 osmget.py data/new/tignes.osm 6.85 45.39 7.07 45.53 4
cd /home/user/WeSki; python3 tools/fetch_dem.py ign /tmp/claude-0/-home-user-WeSki/8c611e3b-9843-5ffb-a79e-28166bcb6a10/scratchpad/data/dem/tignes.tif 6.85 45.39 7.07 45.53
echo TIGDONE
