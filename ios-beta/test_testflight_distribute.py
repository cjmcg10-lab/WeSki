import unittest
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


class FakeClient:
    def __init__(self, build_attrs, groups, conflict_on=()):
        self.calls = []
        self.build_attrs = build_attrs
        self.groups = groups
        self.conflict_on = conflict_on

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
        for suffix in self.conflict_on:
            if path.endswith(suffix):
                raise td.ApiError(409, "exists")
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

    def test_conflicts_are_success(self):
        client = FakeClient(
            {"processingState": "VALID", "usesNonExemptEncryption": False},
            [group("g2", "dev", False)],
            conflict_on=("/relationships/builds", "/betaAppReviewSubmissions"),
        )
        self.run_distribute(client)

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
