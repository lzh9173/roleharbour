"""Verify a fresh WXT build and stage only the files eligible for a Release."""

import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import zipfile


def prepare_release(root: Path, ref: str = "") -> Path:
    package = json.loads((root / "package.json").read_text())
    version = package["version"]
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise ValueError("Release version must be major.minor.patch")
    if ref.startswith("refs/tags/") and ref != f"refs/tags/v{version}":
        raise ValueError("Release tag does not match package.json")

    build = root / ".output/chrome-mv3"
    files = {}
    for path in build.rglob("*"):
        if path.is_symlink():
            raise ValueError("Build must not contain symbolic links")
        if path.is_file():
            name = path.relative_to(build).as_posix()
            if any(part.startswith(".") for part in Path(name).parts) or name.endswith(".map"):
                raise ValueError(f"Private or development file in build: {name}")
            files[name] = path.read_bytes()
    required = {"manifest.json", "background.js", "sidepanel.html", "content-scripts/seek.js", "occupation-sources.txt"}
    if not required.issubset(files):
        raise ValueError("Build is missing required extension files")
    manifest = json.loads(files["manifest.json"])
    if manifest.get("version") != version or manifest.get("manifest_version") != 3:
        raise ValueError("Manifest version does not match the release")

    archive_name = f"roleharbour-{version}-chrome.zip"
    archive_path = root / ".output" / archive_name
    with zipfile.ZipFile(archive_path) as archive:
        members = [item for item in archive.infolist() if not item.is_dir()]
        names = [item.filename for item in members]
        if len(names) != len(set(names)) or set(names) != set(files):
            raise ValueError("ZIP members differ from the fresh build")
        if archive.testzip() is not None:
            raise ValueError("ZIP integrity check failed")
        for name in names:
            if archive.read(name) != files[name]:
                raise ValueError(f"ZIP content differs from fresh build: {name}")

    changelog = (root / "CHANGELOG.md").read_text()
    match = re.search(rf"^## {re.escape(version)}\s*\n(.*?)(?=^## |\Z)", changelog, re.M | re.S)
    if not match or not match[1].strip():
        raise ValueError("Missing release notes for the package version")
    install = (root / "release/INSTALL.txt").read_bytes()
    if f"RoleHarbour {version}".encode() not in install:
        raise ValueError("Installation instructions have a stale version")

    destination = root / "output/release-assets"
    # This directory is generated exclusively by this script.
    if destination.exists():
        shutil.rmtree(destination)
    destination.mkdir(parents=True)
    archive_bytes = archive_path.read_bytes()
    (destination / archive_name).write_bytes(archive_bytes)
    (destination / "INSTALL.txt").write_bytes(install)
    (destination / "RELEASE_NOTES.md").write_text(match[1].strip() + "\n")
    checksums = "".join(
        f"{hashlib.sha256((destination / name).read_bytes()).hexdigest()}  {name}\n"
        for name in [archive_name, "INSTALL.txt"]
    )
    (destination / "SHA256SUMS").write_text(checksums)
    return destination


if __name__ == "__main__":
    output = prepare_release(Path(__file__).resolve().parent.parent, os.environ.get("GITHUB_REF", ""))
    print(f"Verified release assets: {output}")
