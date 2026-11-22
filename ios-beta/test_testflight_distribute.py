import unittest
import urllib.error
from unittest import mock

import jwt
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

import testflight_distribute as td


def make_key():
    key = ec.generate_private_key(ec.SECP256R1())
    pem = key.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    ).decode()
    pub = key.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
    )
    return pem, pub


def group(gid, name, internal, all_builds=False):
    return {"id": gid, "attributes": {"name": name, "isInternalGroup": internal, "hasAccessToAllBuilds": all_builds}}


class Scripted:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def request(self, method, path, params=None, body=None):
        self.calls.append((method, path, params, body))
        item = self.responses.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


class FakeClient:
    def __init__(self, build_attrs, groups):
        self.calls = []
        self.build_attrs = build_attrs
        self.groups = groups

    def request(self, method, path, params=None, body=None):
        self.calls.append((method, path))
        if path == "/apps":
            return {"data": [{"id": "app1"}]}
        if path == "/builds":
            return {"data": [{"id": "b1", "attributes": self.build_attrs}]}
        if path.endswith("/betaGroups"):
            return {"data": self.groups}
        if path.endswith("/betaBuildLocalizations"):
            return {"data": []}
        return {}


class TokenTest(unittest.TestCase):
    def test_claims_and_refresh(self):
        pem, pub = make_key()
        now = [1000]
        client = td.Client(pem, "KID", "ISS", clock=lambda: now[0])
        first = client.bearer()
        claims = jwt.decode(first, pub, algorithms=["ES256"], audience="appstoreconnect-v1", options={"verify_exp": False})
        self.assertEqual(claims["iss"], "ISS")
        self.assertLessEqual(claims["exp"] - claims["iat"], 20 * 60)
        self.assertEqual(jwt.get_unverified_header(first)["kid"], "KID")
        self.assertEqual(client.bearer(), first)
        now[0] += 14 * 60
        self.assertNotEqual(client.bearer(), first)


class DistributeTest(unittest.TestCase):
    def run_distribute(self, client, wanted=()):
        with mock.patch("builtins.print"):
            td.distribute(client, "81", "Fix thing", list(wanted), sleep=lambda s: None)

    def test_internal_all_builds_group_skipped_external_submitted(self):
        client = FakeClient(
            {"processingState": "VALID", "usesNonExemptEncryption": None},
            [group("g1", "Staff", True, True), group("g2", "dev", False)],
        )
        self.run_distribute(client)
        self.assertIn(("PATCH", "/builds/b1"), client.calls)
        self.assertNotIn(("POST", "/betaGroups/g1/relationships/builds"), client.calls)
        self.assertIn(("POST", "/betaGroups/g2/relationships/builds"), client.calls)
        self.assertIn(("POST", "/betaAppReviewSubmissions"), client.calls)

    def test_already_added_and_submitted_are_success(self):
        add = Scripted([td.ApiError(409, "x"), {"data": [{"id": "b1"}]}])
        self.assertEqual(td.add_to_group(add, group("g2", "dev", False), "b1"), "was already in")
        sub = Scripted([td.ApiError(409, '{"errors":[{"code":"ENTITY_ERROR","detail":"Build already submitted"}]}')])
        self.assertIn("already submitted", td.submit_for_review(sub, "b1"))

    def test_other_409_fails(self):
        add = Scripted([td.ApiError(409, "x"), {"data": []}])
        with self.assertRaises(td.ApiError):
            td.add_to_group(add, group("g2", "dev", False), "b1")
        sub = Scripted([td.ApiError(409, '{"errors":[{"code":"STATE_ERROR","detail":"Missing export compliance"}]}')])
        with self.assertRaises(td.ApiError):
            td.submit_for_review(sub, "b1")

    def test_whats_new_patches_existing_and_posts_new(self):
        existing = Scripted([{"data": [{"id": "l1", "attributes": {"locale": "en-US"}}]}, {}])
        td.set_whats_new(existing, "b1", "Hi")
        self.assertEqual(existing.calls[1][:2], ("PATCH", "/betaBuildLocalizations/l1"))
        fresh = Scripted([{"data": [{"id": "l2", "attributes": {"locale": "de-DE"}}]}, {}])
        td.set_whats_new(fresh, "b1", "Hi")
        self.assertEqual(fresh.calls[1][:2], ("POST", "/betaBuildLocalizations"))
        self.assertEqual(fresh.calls[1][3]["data"]["attributes"]["whatsNew"], "Hi")

    def test_poll_not_listed_then_valid(self):
        build = {"id": "b1", "attributes": {"processingState": "VALID"}}
        client = Scripted([{"data": []}, {"data": [build]}])
        sleeps = []
        self.assertEqual(td.wait_for_build(client, "a", "81", sleeps.append), build)
        self.assertEqual(sleeps, [td.POLL_SECONDS])
        self.assertEqual(client.calls[0][2]["filter[preReleaseVersion.platform]"], "IOS")

    def test_poll_retries_5xx_and_network_errors(self):
        build = {"id": "b1", "attributes": {"processingState": "VALID"}}
        client = Scripted([td.ApiError(503, "x"), urllib.error.URLError("down"), {"data": [build]}])
        self.assertEqual(td.wait_for_build(client, "a", "81", lambda s: None), build)

    def test_poll_does_not_retry_client_errors(self):
        with self.assertRaises(td.ApiError):
            td.wait_for_build(Scripted([td.ApiError(401, "x")]), "a", "81", lambda s: None)

    def test_poll_times_out(self):
        ticks = iter(range(0, 100000, 1000))
        client = Scripted([{"data": []}] * 10)
        with self.assertRaises(SystemExit) as ctx:
            td.wait_for_build(client, "a", "81", lambda s: None, clock=lambda: next(ticks))
        self.assertIn("not ready after 40 minutes", str(ctx.exception))

    def test_group_name_case_insensitive_and_missing_lists_found(self):
        groups = [group("g1", "Dev", True), group("g2", "Other", True)]
        self.assertEqual(td.choose_groups(groups, ["dev"]), [groups[0]])
        with self.assertRaises(SystemExit) as ctx:
            td.choose_groups(groups, ["nope"])
        self.assertIn("Dev, Other", str(ctx.exception))

    def test_invalid_build_fails(self):
        client = FakeClient({"processingState": "INVALID"}, [])
        with self.assertRaises(SystemExit):
            self.run_distribute(client)


if __name__ == "__main__":
    unittest.main()
