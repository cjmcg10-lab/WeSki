#!/usr/bin/env python3
"""Rewrite resort configs with each [lon, lat] point on one line (smaller diffs). usage: fmt_config.py file..."""
import re, sys
for f in sys.argv[1:]:
    s = open(f).read()
    s = re.sub(r"\[\s*(-?[\d.]+(?:e-?\d+)?),\s*(-?[\d.]+(?:e-?\d+)?)\s*\]", r"[\1, \2]", s)
    open(f, "w").write(s)
