cd /tmp/claude-0/-home-user-WeSki/8c611e3b-9843-5ffb-a79e-28166bcb6a10/scratchpad
g(){ [ -s data/new/$1.osm ] || python3 osmget.py data/new/$1.osm $2 $3 $4 $5 $6; }
g vail -106.46 39.56 -106.26 39.66 3
g breck -106.13 39.44 -106.03 39.53 2
g parkcity -111.62 40.60 -111.48 40.70 3
g mammoth -119.07 37.60 -118.95 37.67 2
g zermatt 7.68 45.93 7.80 46.03 3
g valthorens 6.52 45.25 6.63 45.34 3
g laplagne 6.60 45.46 6.78 45.60 4
g lesarcs 6.72 45.52 6.90 45.63 4
echo OSMDONE
