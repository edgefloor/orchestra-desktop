#!/usr/bin/env python3
"""Verify desktop fork ancestry and generated Orchestra Codex bindings."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "orchestra-provenance.json"
HEX40 = re.compile(r"[0-9a-f]{40}")
HEX64 = re.compile(r"[0-9a-f]{64}")
ALGORITHM = "sha256-relative-path-nul-file-sha256-lf-v1"


def require_fields(value: object, expected: set[str], context: str) -> dict[str, object]:
    if not isinstance(value, dict):
        raise ValueError(f"{context} must be an object")
    actual = set(value)
    if actual != expected:
        raise ValueError(f"{context} fields must be {sorted(expected)}, found {sorted(actual)}")
    return value


def require_revision(value: object, context: str) -> str:
    if not isinstance(value, str) or HEX40.fullmatch(value) is None:
        raise ValueError(f"{context} must be a lowercase 40-character Git identity")
    return value


def safe_relative_path(value: object, context: str) -> PurePosixPath:
    if not isinstance(value, str):
        raise ValueError(f"{context} must be a string")
    path = PurePosixPath(value)
    if path.is_absolute() or ".." in path.parts or str(path) in {"", "."}:
        raise ValueError(f"{context} must be a safe relative path")
    return path


def generated_identity(root: Path, identity_name: str) -> tuple[int, str]:
    digest = hashlib.sha256()
    files = sorted(path for path in root.rglob("*") if path.is_file() and path.name != identity_name)
    for path in files:
        relative = path.relative_to(root).as_posix()
        file_digest = hashlib.sha256(path.read_bytes()).hexdigest()
        digest.update(relative.encode())
        digest.update(b"\0")
        digest.update(file_digest.encode())
        digest.update(b"\n")
    return len(files), digest.hexdigest()


def git_commit_tree(repository: Path, revision: str) -> str:
    return subprocess.check_output(
        ["git", "-C", str(repository), "rev-parse", f"{revision}^{{tree}}"],
        text=True,
    ).strip()


def verify(codex_root: Path | None) -> None:
    manifest = json.loads(MANIFEST.read_text())
    root = require_fields(manifest, {"schemaVersion", "fork", "upstream", "orchestraCodex"}, "manifest")
    if root["schemaVersion"] != 1:
        raise ValueError("schemaVersion must be 1")
    require_fields(root["fork"], {"repository", "defaultBranch"}, "fork")

    upstream = require_fields(root["upstream"], {"repository", "baseRevision", "baseTree"}, "upstream")
    base_revision = require_revision(upstream["baseRevision"], "upstream.baseRevision")
    require_revision(upstream["baseTree"], "upstream.baseTree")
    subprocess.run(
        ["git", "-C", str(ROOT), "merge-base", "--is-ancestor", base_revision, "HEAD"],
        check=True,
    )
    if git_commit_tree(ROOT, base_revision) != upstream["baseTree"]:
        raise ValueError("upstream base tree does not match the manifest")

    codex = require_fields(
        root["orchestraCodex"],
        {
            "repository",
            "revision",
            "schemaPath",
            "sourceTree",
            "generatedPath",
            "identityPath",
            "digestAlgorithm",
            "digest",
            "fileCount",
        },
        "orchestraCodex",
    )
    revision = require_revision(codex["revision"], "orchestraCodex.revision")
    source_tree = require_revision(codex["sourceTree"], "orchestraCodex.sourceTree")
    schema_path = safe_relative_path(codex["schemaPath"], "orchestraCodex.schemaPath")
    generated_path = safe_relative_path(codex["generatedPath"], "orchestraCodex.generatedPath")
    identity_path = safe_relative_path(codex["identityPath"], "orchestraCodex.identityPath")
    if codex["digestAlgorithm"] != ALGORITHM:
        raise ValueError("unsupported generated binding digest algorithm")
    if not isinstance(codex["digest"], str) or HEX64.fullmatch(codex["digest"]) is None:
        raise ValueError("orchestraCodex.digest must be a lowercase SHA-256")
    if not isinstance(codex["fileCount"], int) or codex["fileCount"] < 1:
        raise ValueError("orchestraCodex.fileCount must be a positive integer")

    identity = require_fields(
        json.loads((ROOT / identity_path).read_text()),
        {
            "schemaVersion",
            "repository",
            "revision",
            "schemaPath",
            "sourceTree",
            "digestAlgorithm",
            "digest",
            "fileCount",
        },
        "generated identity",
    )
    expected_identity = {
        "schemaVersion": 1,
        "repository": codex["repository"],
        "revision": revision,
        "schemaPath": schema_path.as_posix(),
        "sourceTree": source_tree,
        "digestAlgorithm": ALGORITHM,
        "digest": codex["digest"],
        "fileCount": codex["fileCount"],
    }
    if identity != expected_identity:
        raise ValueError("generated binding identity does not match the root manifest")

    count, digest = generated_identity(ROOT / generated_path, identity_path.name)
    if count != codex["fileCount"] or digest != codex["digest"]:
        raise ValueError("generated binding file count or digest does not match the manifest")

    if codex_root is not None:
        source_count, source_digest = generated_identity(codex_root / schema_path, identity_path.name)
        if source_count != count or source_digest != digest:
            raise ValueError("generated bindings do not match the named orchestra-codex source")
        actual_revision = subprocess.check_output(
            ["git", "-C", str(codex_root), "rev-parse", "HEAD"], text=True
        ).strip()
        if actual_revision != revision:
            raise ValueError("orchestra-codex checkout is not at the named source revision")
        actual_tree = subprocess.check_output(
            ["git", "-C", str(codex_root), "rev-parse", f"{revision}:{schema_path.as_posix()}"],
            text=True,
        ).strip()
        if actual_tree != source_tree:
            raise ValueError("orchestra-codex schema tree is not the named source tree")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--codex-root", type=Path)
    args = parser.parse_args()
    try:
        verify(args.codex_root.resolve() if args.codex_root else None)
    except (OSError, ValueError, subprocess.CalledProcessError, json.JSONDecodeError) as error:
        print(f"orchestra provenance verification failed: {error}", file=sys.stderr)
        return 1
    print("orchestra provenance verified")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
