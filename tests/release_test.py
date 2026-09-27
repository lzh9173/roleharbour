"""Exercise publication guards with synthetic ZIPs; no GitHub requests."""

import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest
import zipfile

spec = importlib.util.spec_from_file_location(
    "prepare_release", Path(__file__).resolve().parents[1] / "scripts/prepare-release.py"
)
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.build = self.root / ".output/chrome-mv3"
        self.build.mkdir(parents=True)
        self.archive = self.root / ".output/roleharbour-1.2.3-chrome.zip"
        (self.root / "package.json").write_text('{"version":"1.2.3"}')
        (self.root / "CHANGELOG.md").write_text("# Changelog\n\n## 1.2.3\n\nA new version.\n")
        (self.root / "release").mkdir()
        (self.root / "release/INSTALL.txt").write_text("RoleHarbour 1.2.3")
        for name in ["background.js", "sidepanel.html", "content-scripts/seek.js", "occupation-sources.txt"]:
            path = self.build / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("Synthetic fixture")
        (self.build / "manifest.json").write_text('{"version":"1.2.3","manifest_version":3}')
        self.zip()

    def zip(self):
        with zipfile.ZipFile(self.archive, "w") as archive:
            for path in self.build.rglob("*"):
                if path.is_file():
                    archive.write(path, path.relative_to(self.build))

    def test_valid_build_and_published_asset_checksums(self):
        target = release.prepare_release(self.root, "refs/tags/v1.2.3")
        for line in (target / "SHA256SUMS").read_text().splitlines():
            digest, name = line.split("  ")
            self.assertEqual(digest, hashlib.sha256((target / name).read_bytes()).hexdigest())
        self.assertEqual((target / "RELEASE_NOTES.md").read_text(), "A new version.\n")
        (target / "stale.zip").write_text("previous build")
        release.prepare_release(self.root)
        self.assertFalse((target / "stale.zip").exists())

    def test_tag_mismatch(self):
        with self.assertRaisesRegex(ValueError, "tag"):
            release.prepare_release(self.root, "refs/tags/v2.0.0")

    def test_stale_manifest(self):
        (self.build / "manifest.json").write_text('{"version":"1.0.0","manifest_version":3}')
        self.zip()
        with self.assertRaisesRegex(ValueError, "Manifest"):
            release.prepare_release(self.root)

    def test_zip_missing_member(self):
        (self.build / "background.js").unlink()
        self.zip()
        (self.build / "background.js").write_text("Synthetic fixture")
        with self.assertRaisesRegex(ValueError, "members"):
            release.prepare_release(self.root)

    def test_stale_zip_bytes(self):
        (self.build / "background.js").write_text("Updated bundle")
        with self.assertRaisesRegex(ValueError, "content"):
            release.prepare_release(self.root)

    def test_private_or_development_files(self):
        for name in [".env.local", "source.js.map"]:
            with self.subTest(name=name):
                (self.build / name).write_text("Synthetic private data")
                self.zip()
                with self.assertRaisesRegex(ValueError, "Private"):
                    release.prepare_release(self.root)
                (self.build / name).unlink()

    def test_missing_release_notes(self):
        (self.root / "CHANGELOG.md").write_text("## 1.0.0\nOld release\n")
        with self.assertRaisesRegex(ValueError, "notes"):
            release.prepare_release(self.root)

    def test_stale_installation_instructions(self):
        (self.root / "release/INSTALL.txt").write_text("RoleHarbour 1.0.0")
        with self.assertRaisesRegex(ValueError, "stale"):
            release.prepare_release(self.root)
