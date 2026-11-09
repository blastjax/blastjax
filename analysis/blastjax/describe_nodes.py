#!/usr/bin/env python
"""Packets for the per-node description agents, and the merge back into topology.json.

  python analysis/blastjax/describe_nodes.py packets   # writes map/packets/<id>.md, one per leaf
  python analysis/blastjax/describe_nodes.py merge     # map/descriptions.json -> topology.json leaves

merge checks that every number and identifier-like name in a paragraph occurs in that node's packet,
lists the failures, and leaves a failing node without a description.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
TOPO = HERE / "topology.json"
PACKETS = HERE / "map" / "packets"
DESCRIPTIONS = HERE / "map" / "descriptions.json"
SOURCE_LINES = 150


def leaves(node: dict):
    for child in node.get("children", []):
        if child.get("children") is not None and child["kind"] in ("system", "domain"):
            yield from leaves(child)
        else:
            yield child


def safe(node_id: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]", "_", node_id)


def source_excerpt(location: str) -> str:
    path = ROOT / location
    if path.is_dir():
        files = sorted((p for p in path.rglob("*") if p.suffix in (".py", ".ts", ".tsx")),
                       key=lambda p: -p.stat().st_size)
        listing = "\n".join(f"- {p.relative_to(ROOT).as_posix()}" for p in files)
        main = files[0] if files else None
        head = f"Files in this directory (largest first):\n{listing}\n\n"
    else:
        main, head = path, ""
    if main is None:
        return head
    lines = main.read_text(encoding="utf-8", errors="replace").splitlines()[:SOURCE_LINES]
    numbered = "\n".join(f"{i:4d}  {ln}" for i, ln in enumerate(lines, 1))
    return f"{head}Source excerpt: {main.relative_to(ROOT).as_posix()} (first {len(lines)} lines)\n```\n{numbered}\n```\n"


def packets() -> None:
    topo = json.loads(TOPO.read_text(encoding="utf-8"))
    names = {leaf["id"]: leaf["name"] for leaf in leaves(topo["root"])}
    PACKETS.mkdir(parents=True, exist_ok=True)
    count = 0
    for leaf in leaves(topo["root"]):
        out_edges = [f"- {e['kind']} -> {names.get(e['target'], e['target'])} ({e['target']})"
                     for e in topo["edges"] if e["source"] == leaf["id"]]
        in_edges = [f"- {names.get(e['source'], e['source'])} ({e['source']}) -> {e['kind']}"
                    for e in topo["edges"] if e["target"] == leaf["id"]]
        parts = [f"# Node {leaf['id']}: {leaf['name']}", f"Kind: {leaf['kind']}"]
        if leaf["kind"] == "module":
            parts += [f"Language: {leaf.get('language')}, {leaf.get('loc')} lines of code, location: {leaf.get('file')}", ""]
            parts.append(source_excerpt(leaf["file"]))
        parts += ["## Outgoing connections", *(out_edges or ["- none"]), "",
                  "## Incoming connections", *(in_edges or ["- none"]), ""]
        (PACKETS / f"{safe(leaf['id'])}.md").write_text("\n".join(parts), encoding="utf-8")
        count += 1
    print(f"wrote {count} packets to {PACKETS.relative_to(ROOT)}")


_TOKEN = re.compile(r"\b\d+(?:[.,]\d+)*\b|[A-Za-z_][\w./-]*[_./][\w./-]*|\b[a-z]+[A-Z]\w*\b|\b[A-Z][a-z]+[A-Z]\w*\b")


def suspicious_tokens(text: str, packet: str) -> list[str]:
    missing = []
    for tok in set(_TOKEN.findall(text)):
        tok = tok.rstrip(".,/-")
        if not re.search(r"[_./]|\d|[a-z][A-Z]", tok) or re.fullmatch(r"[A-Za-z]+(/[A-Za-z]+)+", tok):
            continue  # a plain word (or word/word) that only matched because of punctuation
        low = packet.lower()
        if tok and tok.lower() not in low and tok.replace(",", "").lower() not in low:
            missing.append(tok)
    return sorted(missing)


def merge() -> None:
    topo = json.loads(TOPO.read_text(encoding="utf-8"))
    descs = json.loads(DESCRIPTIONS.read_text(encoding="utf-8"))
    merged, failed = 0, {}
    for leaf in leaves(topo["root"]):
        text = descs.get(leaf["id"])
        if not text:
            continue
        packet = (PACKETS / f"{safe(leaf['id'])}.md").read_text(encoding="utf-8")
        bad = suspicious_tokens(text, packet)
        if bad:
            failed[leaf["id"]] = bad
            leaf.pop("description", None)
        else:
            leaf["description"] = text.strip()
            merged += 1
    TOPO.write_text(json.dumps(topo, indent=1), encoding="utf-8")
    total = sum(1 for _ in leaves(topo["root"]))
    print(f"merged {merged} of {total} leaves; {len(failed)} failed the packet check")
    for node_id, bad in failed.items():
        print(f"  {node_id}: {bad}")


if __name__ == "__main__":
    {"packets": packets, "merge": merge}[sys.argv[1]]()
