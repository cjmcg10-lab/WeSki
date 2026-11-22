import http.client
import io
import os
import ssl
import tempfile
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


class TransientTest(unittest.TestCase):
    def test_server_and_rate_limit_errors_are_transient(self):
        for status in (429, 500, 502, 503, 504):
            self.assertTrue(td.is_transient(td.ApiError(status, "x")), status)
        for status in (400, 401, 403, 404, 409, 422):
            self.assertFalse(td.is_transient(td.ApiError(status, "x")), status)

    def test_dropped_connections_are_transient(self):
        for err in (
            urllib.error.URLError("down"),
            TimeoutError("slow"),
            ConnectionResetError("reset"),
            ConnectionAbortedError("aborted"),
            OSError("socket"),
            http.client.RemoteDisconnected("closed"),
            http.client.IncompleteRead(b"par", 10),
            http.client.BadStatusLine("junk"),
        ):
            self.assertTrue(td.is_transient(err), repr(err))

    def test_raw_http_errors_judged_by_status(self):
        def http_error(code):
            return urllib.error.HTTPError("https://x", code, "msg", {}, io.BytesIO(b""))

        for code in (400, 401, 403, 404, 409):
            self.assertFalse(td.is_transient(http_error(code)), code)
        for code in (429, 500, 503):
            self.assertTrue(td.is_transient(http_error(code)), code)

    def test_certificate_failures_are_not_transient(self):
        bad = ssl.SSLCertVerificationError("certificate verify failed")
        self.assertFalse(td.is_transient(bad))
        self.assertFalse(td.is_transient(urllib.error.URLError(bad)))

    def test_programming_errors_are_not_transient(self):
        for err in (ValueError("x"), KeyError("x"), TypeError("x"), SystemExit("x")):
            self.assertFalse(td.is_transient(err), repr(err))


class FakeResponse(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class ClientRequestTest(unittest.TestCase):
    def setUp(self):
        self.pem, _ = make_key()

    def client(self, opener):
        return td.Client(self.pem, "KID", "ISS", opener=opener)

    def test_reads_json_and_sends_auth(self):
        seen = []

        def opener(req, timeout):
            seen.append(req)
            return FakeResponse(b'{"data": []}')

        self.assertEqual(self.client(opener).request("GET", "/apps", {"filter[bundleId]": "x"}), {"data": []})
        self.assertTrue(seen[0].get_header("Authorization").startswith("Bearer "))
        self.assertIn("filter%5BbundleId%5D=x", seen[0].full_url)

    def test_http_error_becomes_api_error(self):
        def opener(req, timeout):
            raise urllib.error.HTTPError(req.full_url, 409, "Conflict", {}, io.BytesIO(b"conflict body"))

        with self.assertRaises(td.ApiError) as ctx:
            self.client(opener).request("POST", "/x", body={})
        self.assertEqual((ctx.exception.status, ctx.exception.body), (409, "conflict body"))

    def test_dropped_connection_passes_through_as_transient(self):
        def disconnect(req, timeout):
            raise http.client.RemoteDisconnected("closed")

        class Truncated(FakeResponse):
            def read(self, *a):
                raise http.client.IncompleteRead(b"{", 50)

        for opener in (disconnect, lambda req, timeout: Truncated()):
            with self.assertRaises(Exception) as ctx:
                self.client(opener).request("GET", "/builds")
            self.assertTrue(td.is_transient(ctx.exception), repr(ctx.exception))


class MainTest(unittest.TestCase):
    def run_main(self, err):
        with tempfile.TemporaryDirectory() as tmp:
            key = os.path.join(tmp, "key.p8")
            with open(key, "w") as f:
                f.write("unused")
            env = {"ASC_KEY_PATH": key, "ASC_KEY_ID": "K", "ASC_ISSUER_ID": "I", "BUILD_NUMBER": "81"}
            with mock.patch.dict(os.environ, env), mock.patch.object(td, "distribute", side_effect=err), \
                    mock.patch("sys.stderr", new_callable=io.StringIO) as stderr:
                return td.main(), stderr.getvalue()

    def test_dropped_connection_reported_cleanly(self):
        for err in (http.client.RemoteDisconnected("closed"), ConnectionResetError("reset"), urllib.error.URLError("x")):
            code, out = self.run_main(err)
            self.assertEqual(code, 1)
            self.assertIn("Could not reach App Store Connect", out)

    def test_api_error_reported(self):
        code, out = self.run_main(td.ApiError(401, "nope"))
        self.assertEqual(code, 1)
        self.assertIn("App Store Connect error: HTTP 401", out)


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
        add = Scripted([td.ApiError(409, "x"), {"data": [{"type": "betaGroups", "id": "g2"}]}])
        self.assertEqual(td.add_to_group(add, group("g2", "dev", False), "b1"), "was already in")
        self.assertEqual(add.calls[1][:2], ("GET", "/builds/b1/relationships/betaGroups"))
        sub = Scripted([td.ApiError(409, "x"), {"data": {"type": "betaAppReviewSubmissions", "id": "s1"}}])
        self.assertIn("already submitted", td.submit_for_review(sub, "b1"))
        self.assertEqual(sub.calls[1][:2], ("GET", "/builds/b1/betaAppReviewSubmission"))

    def test_other_409_fails(self):
        add = Scripted([td.ApiError(409, "x"), {"data": [{"type": "betaGroups", "id": "other"}]}])
        with self.assertRaises(td.ApiError) as ctx:
            td.add_to_group(add, group("g2", "dev", False), "b1")
        self.assertEqual(ctx.exception.status, 409)
        # The word "already" in the error no longer counts: only a submission App Store Connect confirms does.
        already = '{"errors":[{"code":"STATE_ERROR","detail":"Build already has a problem"}]}'
        for lookup in ({"data": None}, td.ApiError(404, "none")):
            sub = Scripted([td.ApiError(409, already), lookup])
            with self.assertRaises(td.ApiError) as ctx:
                td.submit_for_review(sub, "b1")
            self.assertEqual(ctx.exception.status, 409)

    def test_group_check_follows_pages(self):
        add = Scripted([
            td.ApiError(409, "x"),
            {"data": [{"id": "g1"}], "links": {"next": "https://example.invalid/page2"}},
            {"data": [{"id": "g2"}], "links": {}},
        ])
        self.assertEqual(td.add_to_group(add, group("g2", "dev", False), "b1"), "was already in")
        self.assertEqual(add.calls[2][1], "https://example.invalid/page2")

    def test_group_check_falls_back_when_lookup_missing(self):
        add = Scripted([td.ApiError(409, "x"), td.ApiError(404, "no such path"), {"data": [{"id": "b1"}]}])
        self.assertEqual(td.add_to_group(add, group("g2", "dev", False), "b1"), "was already in")
        self.assertEqual(add.calls[2][1], "/betaGroups/g2/builds")
        for status in (403, 405):
            add = Scripted([
                td.ApiError(409, "x"),
                td.ApiError(status, "METHOD_FORBIDDEN"),
                {"data": [{"id": "b0"}], "links": {"next": "https://example.invalid/builds2"}},
                {"data": [{"id": "b1"}]},
            ])
            self.assertEqual(td.add_to_group(add, group("g2", "dev", False), "b1"), "was already in", status)
            self.assertEqual(add.calls[3][1], "https://example.invalid/builds2")
        missing = Scripted([td.ApiError(409, "x"), td.ApiError(404, "no such path"), {"data": [{"id": "b0"}]}])
        with self.assertRaises(td.ApiError) as ctx:
            td.add_to_group(missing, group("g2", "dev", False), "b1")
        self.assertEqual(ctx.exception.status, 409)
        bad = Scripted([td.ApiError(409, "x"), td.ApiError(500, "down")])
        with self.assertRaises(td.ApiError) as ctx:
            td.add_to_group(bad, group("g2", "dev", False), "b1")
        self.assertEqual(ctx.exception.status, 500)

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

    def test_poll_retries_dropped_connections(self):
        build = {"id": "b1", "attributes": {"processingState": "VALID"}}
        client = Scripted([
            http.client.RemoteDisconnected("closed"),
            ConnectionResetError("reset"),
            http.client.IncompleteRead(b"par"),
            TimeoutError("slow"),
            {"data": [build]},
        ])
        sleeps = []
        with mock.patch("builtins.print"):
            self.assertEqual(td.wait_for_build(client, "a", "81", sleeps.append), build)
        self.assertEqual(len(sleeps), 4)

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
