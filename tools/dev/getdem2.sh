cd /tmp/claude-0/-home-user-WeSki/8c611e3b-9843-5ffb-a79e-28166bcb6a10/scratchpad/data/dem
B=https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/1m/Projects
d(){ [ -s $1 ] || curl -s -f -m 1500 --retry 3 -o $1 $B/$2 || echo "FAIL $1"; ls -la $1 | awk '{print $5, $9}'; }
C=CO_Central_Western_2016/TIFF/USGS_one_meter
for t in x41y439 x42y439 x42y438 x41y438; do d key_$t.tif ${C}_${t}_CO_Central_Western_2016.tif; done
for t in x39y438 x40y438 x39y437 x40y437; do d cop_$t.tif ${C}_${t}_CO_Central_Western_2016.tif; done
d sb_x34y448.tif CO_CONMGaps_D24/TIFF/USGS_1M_13_x34y448_CO_CONMGaps_D24.tif
d sb_x34y449.tif CO_CONMGaps_D24/TIFF/USGS_1M_13_x34y449_CO_CONMGaps_D24.tif
d sb_x35y448.tif CO_NorthwestCO_2020_D20/TIFF/USGS_1M_13_x35y448_CO_NorthwestCO_2020_D20.tif
d sb_x35y449.tif CO_NorthwestCO_2020_D20/TIFF/USGS_1M_13_x35y449_CO_NorthwestCO_2020_D20.tif
for t in x42y442 x43y442; do d wp_$t.tif CO_DRCOG_2020_B20/TIFF/USGS_1M_13_${t}_CO_DRCOG_2020_B20.tif; done
for t in x24y431 x24y432 x25y431; do d hv_$t.tif CA_SierraNevada_B22/TIFF/USGS_1M_11_${t}_CA_SierraNevada_B22.tif; done
d hv_x25y432.tif NV_WestCentral_EarthMRI_2020_D20/TIFF/USGS_1M_11_x25y432_NV_WestCentral_EarthMRI_2020_D20.tif
echo DEMDONE
