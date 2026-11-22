"""Tests for tools/reports.py and tools/skiheat.py: python3 -m unittest discover -s tools -p 'test_*.py'"""
import os, sys, unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from reports import describe, find_feature, format_report, osm_link, parse_day, select_new  # noqa: E402
from skiheat import clean_heat, clusters, describe_clusters, run_counts  # noqa: E402

# a flat projection: 1 m east = 0.00001 deg lon, 1 m north = 0.00001 deg lat, origin at (10, 45)
ZERO = [0] * 10
PROJ = {"xm": 0, "ym": 0, "lon0": 10, "lat0": 45, "clon": [0, 1e-5] + ZERO[2:], "clat": [0, 0, 1e-5] + ZERO[3:]}
RESORT = {
    "name": "Test", "proj": PROJ,
    "trails": [{"id": 0, "osm": 111, "name": "Upper Run", "pts": [0, 0, 0, 100]},
               {"id": 1, "osm": None, "name": "Traced Glade", "pts": [200, 0, 200, 100]},
               {"id": 2, "osm": 333, "name": "Hidden Bit", "pts": [50, 0, 50, 100], "hide": "not on the list"}],
    "lifts": [{"id": 0, "osm": 999, "name": "Summit Chair", "pts": [500, 0, 500, 300]}],
}
REPORTS = [{"id": 3, "at": parse_day("2026-12-03"), "kind": "wrong_rating", "x": 0, "y": 50, "ref": "111", "text": "black"},
           {"id": 2, "at": parse_day("2026-12-02"), "kind": "missing", "x": 1000, "y": 1000, "ref": "", "text": ""},
           {"id": 1, "at": parse_day("2026-12-01"), "kind": "other", "x": 205, "y": 50, "ref": "", "text": ""}]


class Reports(unittest.TestCase):
    def test_select_by_marker_oldest_first(self):
        self.assertEqual([r["id"] for r in select_new(REPORTS, 0)], [1, 2, 3])
        self.assertEqual([r["id"] for r in select_new(REPORTS, 2)], [3])
        self.assertEqual(select_new(REPORTS, 3), [])
        self.assertEqual(select_new([], 0), [])

    def test_select_by_date_ignores_marker(self):
        self.assertEqual([r["id"] for r in select_new(REPORTS, 3, parse_day("2026-12-02"))], [2, 3])

    def test_find_by_osm_number_and_nearest(self):
        self.assertEqual(find_feature(RESORT, "111")[1]["name"], "Upper Run")
        self.assertEqual(find_feature(RESORT, "999")[0], "lift")
        self.assertEqual(find_feature(RESORT, "1")[1]["name"], "Traced Glade")   # run number of a run with no OSM id
        self.assertIsNone(find_feature(RESORT, "0"))      # run 0 has an OSM id, so "0" is not it
        kind, f, how = find_feature(RESORT, "", 205, 50)
        self.assertEqual((kind, f["name"]), ("run", "Traced Glade"))
        self.assertIn("5 m", how)
        self.assertIsNone(find_feature(RESORT, "", 1000, 1000))

    def test_describe_and_link(self):
        d = describe(REPORTS[0], RESORT)
        self.assertEqual(d["kind"], "Wrong rating")
        self.assertIn("Upper Run", d["what"])
        self.assertEqual(d["link"], osm_link(10.0, 45.0005))
        self.assertIn("mlat=45.00050&mlon=10.00000", d["link"])
        self.assertIn("2026-12-03", format_report(d))
        self.assertEqual(describe(REPORTS[1], RESORT)["what"], "(not on a run)")
        self.assertEqual(describe({"id": 9, "at": 0, "kind": "x", "ref": "42"})["what"], "ref 42")   # no resort.json


class Heat(unittest.TestCase):
    def test_clean_heat_handles_nothing(self):
        for bad in (None, [], "x", {"runs": [1]}):
            h = clean_heat(bad)
            self.assertEqual((h["days"], h["runs"], h["cells"]), (0, {}, {}))

    def test_run_counts_by_osm_id_or_number(self):
        h = clean_heat({"days": 9, "runs": {"0": 6, "1": 5, "7": 8}, "cells": {}})
        self.assertEqual(run_counts(h, RESORT), {"111": 6, "n1": 5})

    def test_clusters_join_touching_squares_only(self):
        cells = {"10,10": 5, "11,11": 7, "12,11": 6, "40,40": 9, "41,40": 5}
        g = clusters(cells, 20, min_cells=2)
        self.assertEqual([x["cells"] for x in g], [3, 2])
        self.assertEqual(g[0]["days"], 7)
        self.assertEqual(clusters(cells, 20, min_cells=3)[0]["sum"], 18)
        self.assertEqual(clusters({"bad": 5}), [])

    def test_describe_clusters_skips_hidden_runs(self):
        g = describe_clusters(clusters({"3,2": 5, "3,3": 5, "3,4": 5}, 20), RESORT)   # x = 70 m: near the hidden run
        self.assertEqual(g[0]["near"], "Upper Run")
        self.assertEqual(g[0]["near_m"], 70)
        self.assertTrue(g[0]["link"].startswith("https://www.openstreetmap.org/?mlat="))


if __name__ == "__main__":
    unittest.main()
