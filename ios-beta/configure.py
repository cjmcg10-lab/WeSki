import os
import plistlib
from pathlib import Path
from subprocess import run
from PIL import Image
import json

app = Path("ios/App/App")
plist = app / "Info.plist"
info = plistlib.loads(plist.read_bytes())
info.update({
    "NSLocationWhenInUseUsageDescription": "Show your position on the ski map and record runs when you start tracking.",
    "NSLocationAlwaysAndWhenInUseUsageDescription": "Keep recording runs and updating your group during an active ski session while your screen is locked.",
    "UIBackgroundModes": ["location"],
    "CFBundleShortVersionString": "1.0",
    "CFBundleVersion": str(int(os.environ.get("GITHUB_RUN_NUMBER", "1")) * 10 + int(os.environ.get("GITHUB_RUN_ATTEMPT", "1"))),
    "UISupportedInterfaceOrientations": ["UIInterfaceOrientationPortrait"],
})
plist.write_bytes(plistlib.dumps(info))
iconset = app / "Assets.xcassets/AppIcon.appiconset"
image = Image.open("../public/icons/icon-512.png").convert("RGBA")
base = Image.new("RGB", image.size, "#0b2239")
base.paste(image, mask=image.getchannel("A"))
base.resize((1024, 1024), Image.Resampling.LANCZOS).save(iconset / "SkiWithMe.png")
(iconset / "Contents.json").write_text(json.dumps({"images":[{"filename":"SkiWithMe.png","idiom":"universal","platform":"ios","size":"1024x1024"}],"info":{"author":"xcode","version":1}}))
