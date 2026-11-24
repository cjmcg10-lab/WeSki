"""The building style rules (tools/building_style.py) give the expected style for every shared case.
Run: python3 -m unittest discover -s tools -p 'test_*.py'"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import building_style  # noqa: E402

FIXTURE = os.path.join(building_style.ROOT, "tests", "fixtures", "building_styles.json")


class BuildingStyleTest(unittest.TestCase):
    def test_shared_cases(self):
        self.assertEqual(building_style.check_fixture(FIXTURE), 0)

    def test_context(self):
        lifts = [{"kind": "chair", "pts": [0, 0, 1000, 0]}, {"kind": "carpet", "pts": [500, 500, 560, 500]}]
        pois = [{"kind": "peak", "x": 2000, "y": 0}]
        self.assertEqual(building_style.context(30, 30, lifts, pois), (True, False))
        self.assertEqual(building_style.context(1040, 0, lifts, pois), (False, True))
        self.assertEqual(building_style.context(2100, 0, lifts, pois), (False, True))
        self.assertEqual(building_style.context(560, 500, lifts, pois), (False, False))   # magic carpets do not count

    def test_footprint(self):
        a, cx, cy = building_style.footprint([0, 0, 10, 0, 10, 20, 0, 20])
        self.assertEqual((a, cx, cy), (200, 5, 10))


if __name__ == "__main__":
    unittest.main()
