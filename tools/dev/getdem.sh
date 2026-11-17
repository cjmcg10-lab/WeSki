cd /tmp/claude-0/-home-user-WeSki/8c611e3b-9843-5ffb-a79e-28166bcb6a10/scratchpad/data/dem
B=https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/1m/Projects
d(){ [ -s $1 ] || curl -s -f -m 1500 --retry 3 -o $1 $B/$2 || echo "FAIL $1"; ls -la $1 | awk '{print $5, $9}'; }
for t in x37y439 x38y439 x38y440 x38y438; do d vail_$t.tif CO_Central_Western_2016/TIFF/USGS_one_meter_${t}_CO_Central_Western_2016.tif; done
for t in x40y437 x40y438; do d breck_$t.tif CO_Central_Western_2016/TIFF/USGS_one_meter_${t}_CO_Central_Western_2016.tif; done
for t in x44y450 x45y450 x45y451 x44y451; do d pc_$t.tif UT_Central_QL1_B1_2018/TIFF/USGS_one_meter_${t}_UT_Central_QL1_B1_2018.tif; done
for t in x31y417 x32y417; do d mam_$t.tif CA_SierraNevada_B22/TIFF/USGS_1M_11_${t}_CA_SierraNevada_B22.tif; done
echo DEMDONE
