cd /tmp/claude-0/-home-user-WeSki/8c611e3b-9843-5ffb-a79e-28166bcb6a10/scratchpad
g(){ [ -s data/new/$1.osm ] || python3 osmget.py data/new/$1.osm $2 $3 $4 $5 $6; }
g keystone -105.99 39.55 -105.88 39.62 2
g copper -106.20 39.46 -106.11 39.52 2
g steamboat -106.84 40.42 -106.73 40.49 2
g winterpark -105.82 39.84 -105.73 39.90 2
g heavenly -119.98 38.89 -119.86 38.97 3
g whistler -123.02 50.03 -122.85 50.13 3
g skiwelt 12.12 47.41 12.36 47.53 4
g saalbach 12.52 47.33 12.75 47.45 4
echo OSMDONE
