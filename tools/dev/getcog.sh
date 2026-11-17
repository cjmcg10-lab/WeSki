cd /home/user/WeSki; export CURL_CA_BUNDLE=/root/.ccr/ca-bundle.crt
A=https://data.bev.gv.at/download/ALS/DTM/20230915/ALS_DTM_CRS3035RES50000m
python3 tools/fetch_dem.py cog /tmp/claude-0/-home-user-WeSki/8c611e3b-9843-5ffb-a79e-28166bcb6a10/scratchpad/data/dem/whistler.tif -123.03 50.02 -122.84 50.14 32610 https://canelevation-dem.s3.ca-central-1.amazonaws.com/hrdem-lidar/BC-Squamish_2016-1m-dtm.tif
python3 tools/fetch_dem.py cog /tmp/claude-0/-home-user-WeSki/8c611e3b-9843-5ffb-a79e-28166bcb6a10/scratchpad/data/dem/skiwelt.tif 12.10 47.39 12.38 47.54 32633 ${A}N2700000E4450000.tif ${A}N2700000E4500000.tif ${A}N2650000E4450000.tif
python3 tools/fetch_dem.py cog /tmp/claude-0/-home-user-WeSki/8c611e3b-9843-5ffb-a79e-28166bcb6a10/scratchpad/data/dem/saalbach.tif 12.50 47.32 12.78 47.49 32633 ${A}N2700000E4500000.tif ${A}N2650000E4500000.tif
echo COGDONE
