cd /tmp/claude-0/-home-user-WeSki/8c611e3b-9843-5ffb-a79e-28166bcb6a10/scratchpad/data/dem
B=https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/1m/Projects
for t in x37y438 x37y439 x38y439 x38y440 x38y438; do curl -s -f -m 1500 --retry 3 -o vail_$t.tif $B/CO_Central_Western_2016/TIFF/USGS_one_meter_${t}_CO_Central_Western_2016.tif || echo FAIL $t; done
echo VAILDONE
