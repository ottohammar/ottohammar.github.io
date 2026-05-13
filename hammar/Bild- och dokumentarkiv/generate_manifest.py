#!/usr/bin/env python3
"""
generate_manifest.py — Hammarska Släktföreningen
Walks a directory and writes manifest.json for the file browser.

Usage:
    python generate_manifest.py                        # scans current directory
    python generate_manifest.py path/to/files          # scans given directory
    python generate_manifest.py path/to/files -o path/to/manifest.json
    python generate_manifest.py --help
"""

import argparse
import json
import os
import sys

# ── File type classification ───────────────────────────────────────────────
IMAGE_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".gif", ".webp",
    ".bmp", ".svg", ".tif", ".tiff",
}

DOCUMENT_EXTENSIONS = {
    ".pdf", ".doc", ".docx", ".xls", ".xlsx",
    ".ppt", ".pptx", ".txt", ".csv", ".odt", ".ods",
}

# Files and directories to silently skip
IGNORE_NAMES = {
    "manifest.json", "browser.html", "browser.css", "browser.js",
    "generate_manifest.py", ".DS_Store", "Thumbs.db", "desktop.ini",
}

IGNORE_PREFIXES = (".", "_")


def classify(filename: str) -> str | None:
    """Return 'image', 'document', or None (skip)."""
    ext = os.path.splitext(filename)[1].lower()
    if ext in IMAGE_EXTENSIONS:
        return "image"
    if ext in DOCUMENT_EXTENSIONS:
        return "document"
    return None


def human_size(n_bytes: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n_bytes < 1024:
            return f"{n_bytes:.0f} {unit}" if unit == "B" else f"{n_bytes:.1f} {unit}"
        n_bytes /= 1024
    return f"{n_bytes:.1f} TB"


def build_tree(directory: str, base: str) -> dict:
    """
    Recursively build the manifest node for *directory*.
    *base* is the root scan directory — used to make all paths relative.
    """
    entries = []

    try:
        items = sorted(os.scandir(directory), key=lambda e: (e.is_file(), e.name.lower()))
    except PermissionError:
        print(f"  [skip] no permission: {directory}", file=sys.stderr)
        return {"name": os.path.basename(directory), "type": "folder", "children": []}

    for item in items:
        name = item.name

        # Skip hidden / system files and the browser's own files
        if name in IGNORE_NAMES or name.startswith(IGNORE_PREFIXES):
            continue

        if item.is_dir(follow_symlinks=False):
            child = build_tree(item.path, base)
            entries.append(child)

        elif item.is_file(follow_symlinks=False):
            file_type = classify(name)
            if file_type is None:
                continue   # unsupported extension — skip silently

            rel_path = os.path.relpath(item.path, base).replace(os.sep, "/")
            size_str = human_size(item.stat().st_size)

            entries.append({
                "name": name,
                "type": file_type,
                "path": rel_path,
                "size": size_str,
            })

    return {
        "name": os.path.basename(directory) or "root",
        "type": "folder",
        "children": entries,
    }


def main():
    parser = argparse.ArgumentParser(
        description="Generate manifest.json for the Hammarska file browser.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "directory",
        nargs="?",
        default=".",
        help="Root directory to scan (default: current directory)",
    )
    parser.add_argument(
        "-o", "--output",
        default=None,
        help="Output path for manifest.json (default: <directory>/manifest.json)",
    )
    parser.add_argument(
        "--indent",
        type=int,
        default=2,
        help="JSON indentation (default: 2)",
    )
    args = parser.parse_args()

    scan_dir = os.path.abspath(args.directory)
    if not os.path.isdir(scan_dir):
        print(f"Error: '{scan_dir}' is not a directory.", file=sys.stderr)
        sys.exit(1)

    out_path = args.output or os.path.join(scan_dir, "manifest.json")

    print(f"Scanning : {scan_dir}")
    manifest = build_tree(scan_dir, scan_dir)
    manifest["name"] = "root"   # top-level node is always "root"

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=args.indent)

    # Summary
    def count(node, file_type):
        n = sum(1 for c in node.get("children", []) if c["type"] == file_type)
        return n + sum(count(c, file_type) for c in node.get("children", []) if c["type"] == "folder")

    images    = count(manifest, "image")
    documents = count(manifest, "document")
    folders   = count(manifest, "folder")

    print(f"Written  : {out_path}")
    print(f"Found    : {folders} folders, {images} images, {documents} documents")


if __name__ == "__main__":
    main()
