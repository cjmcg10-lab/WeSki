import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

import jwt

API = "https://api.appstoreconnect.apple.com/v1"
BUNDLE_ID = "app.builtbyroger.skiwithme"
TOKEN_LIFETIME = 15 * 60
POLL_SECONDS = 30
POLL_LIMIT_SECONDS = 40 * 60
WHATS_NEW_LIMIT = 4000


class ApiError(Exception):
    def __init__(self, status, body):
        super().__init__(f"HTTP {status}: {body[:500]}")
        self.status = status
        self.body = body


class Client:
    def __init__(self, key_pem, key_id, issuer, clock=time.time, opener=urllib.request.urlopen):
        self.key_pem = key_pem
        self.key_id = key_id
        self.issuer = issuer
        self.clock = clock
        self.opener = opener
        self.token = None
        self.token_expires = 0

    def bearer(self):
        now = int(self.clock())
        if self.token is None or now > self.token_expires - 120:
            self.token_expires = now + TOKEN_LIFETIME
            self.token = jwt.encode(
                {"iss": self.issuer, "iat": now, "exp": self.token_expires, "aud": "appstoreconnect-v1"},
                self.key_pem,
                algorithm="ES256",
                headers={"kid": self.key_id, "typ": "JWT"},
            )
        return self.token

    def request(self, method, path, params=None, body=None):
        url = path if path.startswith("http") else API + path
        if params:
            url += "?" + urllib.parse.urlencode(params)
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Authorization", "Bearer " + self.bearer())
        if data is not None:
            req.add_header("Content-Type", "application/json")
        try:
            with self.opener(req, timeout=60) as resp:
                raw = resp.read()
        except urllib.error.HTTPError as err:
            raise ApiError(err.code, err.read().decode("utf-8", "replace")) from None
        return json.loads(raw) if raw else {}


def find_app(client, bundle_id):
    apps = client.request("GET", "/apps", {"filter[bundleId]": bundle_id})["data"]
    if not apps:
        raise SystemExit(f"No app with bundle id {bundle_id} in App Store Connect")
    return apps[0]["id"]


def wait_for_build(client, app_id, build_number, sleep=time.sleep, clock=time.monotonic):
    deadline = clock() + POLL_LIMIT_SECONDS
    while True:
        builds = client.request(
            "GET",
            "/builds",
            {"filter[app]": app_id, "filter[version]": build_number, "limit": 1},
        )["data"]
        if builds:
            state = builds[0]["attributes"]["processingState"]
            if state == "VALID":
                return builds[0]
            if state in ("INVALID", "FAILED"):
                raise SystemExit(f"Build {build_number} processing ended as {state}")
            print(f"Build {build_number} is {state}; waiting")
        else:
            print(f"Build {build_number} not listed yet; waiting")
        if clock() >= deadline:
            raise SystemExit(f"Build {build_number} was not ready after {POLL_LIMIT_SECONDS // 60} minutes")
        sleep(POLL_SECONDS)


def declare_no_encryption(client, build):
    if build["attributes"].get("usesNonExemptEncryption") is None:
        client.request(
            "PATCH",
            f"/builds/{build['id']}",
            body={"data": {"type": "builds", "id": build["id"], "attributes": {"usesNonExemptEncryption": False}}},
        )
        print("Declared the build uses no non-exempt encryption")


def choose_groups(groups, wanted):
    if not wanted:
        return groups
    by_name = {g["attributes"]["name"].lower(): g for g in groups}
    missing = [w for w in wanted if w.lower() not in by_name]
    if missing:
        found = ", ".join(g["attributes"]["name"] for g in groups) or "none"
        raise SystemExit(f"No beta group named {', '.join(missing)}. Groups found: {found}")
    return [by_name[w.lower()] for w in wanted]


def add_to_group(client, group, build_id):
    try:
        client.request(
            "POST",
            f"/betaGroups/{group['id']}/relationships/builds",
            body={"data": [{"type": "builds", "id": build_id}]},
        )
    except ApiError as err:
        if err.status != 409:
            raise
        return "was already in"
    return "added to"


def set_whats_new(client, build_id, text):
    text = text[:WHATS_NEW_LIMIT]
    locs = client.request("GET", f"/builds/{build_id}/betaBuildLocalizations")["data"]
    existing = next((x for x in locs if x["attributes"]["locale"] == "en-US"), None)
    if existing:
        client.request(
            "PATCH",
            f"/betaBuildLocalizations/{existing['id']}",
            body={"data": {"type": "betaBuildLocalizations", "id": existing["id"], "attributes": {"whatsNew": text}}},
        )
    else:
        client.request(
            "POST",
            "/betaBuildLocalizations",
            body={
                "data": {
                    "type": "betaBuildLocalizations",
                    "attributes": {"locale": "en-US", "whatsNew": text},
                    "relationships": {"build": {"data": {"type": "builds", "id": build_id}}},
                }
            },
        )


def submit_for_review(client, build_id):
    try:
        client.request(
            "POST",
            "/betaAppReviewSubmissions",
            body={
                "data": {
                    "type": "betaAppReviewSubmissions",
                    "relationships": {"build": {"data": {"type": "builds", "id": build_id}}},
                }
            },
        )
    except ApiError as err:
        if err.status != 409:
            raise
        return "was already submitted for beta review"
    return "submitted for beta review"


def distribute(client, build_number, whats_new, wanted_groups, sleep=time.sleep, clock=time.monotonic):
    app_id = find_app(client, BUNDLE_ID)
    build = wait_for_build(client, app_id, build_number, sleep, clock)
    declare_no_encryption(client, build)
    groups = choose_groups(client.request("GET", f"/apps/{app_id}/betaGroups", {"limit": 200})["data"], wanted_groups)
    external = False
    for group in groups:
        attrs = group["attributes"]
        name = attrs["name"]
        if attrs.get("isInternalGroup") and attrs.get("hasAccessToAllBuilds"):
            print(f"Group {name}: internal, gets every build already")
            continue
        print(f"Group {name}: build {build_number} {add_to_group(client, group, build['id'])} the group")
        external = external or not attrs.get("isInternalGroup")
    if external:
        if whats_new:
            set_whats_new(client, build["id"], whats_new)
            print("Set What to Test")
        print(f"Build {build_number} {submit_for_review(client, build['id'])}")


def main():
    key_pem = open(os.environ["ASC_KEY_PATH"]).read()
    client = Client(key_pem, os.environ["ASC_KEY_ID"], os.environ["ASC_ISSUER_ID"])
    wanted = [g.strip() for g in os.environ.get("TESTFLIGHT_GROUPS", "").split(",") if g.strip()]
    try:
        distribute(client, os.environ["BUILD_NUMBER"], os.environ.get("WHATS_NEW", "").strip(), wanted)
    except ApiError as err:
        print(f"App Store Connect error: {err}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
