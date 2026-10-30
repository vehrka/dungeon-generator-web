"""Neon mock-up (docs/plans/20-neon-design.md): restyles a catalogue SVG from the CLI, no engine code.

python3 -I ref/neon/mock.py ref/neon/m-1-cyber.json ref/neon/m-1-cyber-catalogue.svg ref/neon/m-1-cyber-neon.svg
Prints each fill's contrast with the number ink. Throwaway: the painter is render/neon.ts (step 2).
"""
import json
import re
import sys
from pathlib import Path

page = "#0b0814"  # indigo-black, the reference's darkest tone pushed darker
corridor = "#141a2a"
corridor_line = "#2b3550"
ink = "#eef2ff"
muted = "#7d86a8"
rule = "#232a40"
gate = "#ffd23f"  # gate tags and lock marks: the one warm note not used by a role
roles = {  # role → neon colour (wall and glow); fill mixes it into the page
    "start": "#19e3ff",
    "goal": "#ff2bd6",
    "boss": "#ff3b4f",  # red, apart from the goal: the draft's dimmer magenta read as a second goal
    "pickup": "#ffa53a",  # amber, kin to the gate yellow: what a pickup opens
    "treasure": "#a66bff",
    "other0": "#1fbfa5",
    "other1": "#3d7bff",
    "other2": "#5b8aa6",
}
fill_mix = {"start": 0.30, "goal": 0.40, "boss": 0.30, "pickup": 0.28, "treasure": 0.30}  # others 0.18: they recede
glow = [(16, 0.10), (9, 0.22), (4, 0.45)]  # (stroke px, opacity), widest first; drawn under the fill, so only the outer half shows
wall = 2
mono = "'DejaVu Sans Mono','Noto Sans Mono','Liberation Mono',Menlo,Consolas,monospace"


def role(node: dict, start: int, goal: int) -> str:
    t = node["type"]
    if node["id"] == start or t in ("st", "exit"):
        return "start"
    if node["id"] == goal or t == "gl":
        return "goal"
    if t in ("eb", "em"):
        return "boss"
    if t in ("key", "bosskey", "item", "switch", "lever"):
        return "pickup"
    if t.startswith("gb:"):
        return "treasure"
    return f"other{node['number'] % 3}"


def rgb(h: str) -> list[int]:
    return [int(h[i : i + 2], 16) for i in (1, 3, 5)]


def mix(a: str, b: str, t: float) -> str:
    return "#" + "".join(f"{round(x + (y - x) * t):02x}" for x, y in zip(rgb(a), rgb(b)))


def lum(h: str) -> float:
    c = [v / 255 for v in rgb(h)]
    c = [v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def contrast(a: str, b: str) -> float:
    la, lb = sorted([lum(a), lum(b)], reverse=True)
    return (la + 0.05) / (lb + 0.05)


def main(json_path: str, svg_in: str, svg_out: str) -> None:
    d = json.loads(Path(json_path).read_text())
    by_number = {n["number"]: role(n, d["start"], d["goal"]) for n in d["nodes"] if n["kind"] == "room"}
    fills = {r: mix(page, c, fill_mix.get(r, 0.18)) for r, c in roles.items()}
    for r, f in fills.items():
        print(f"{r:9} fill {f}  contrast {contrast(ink, f):.1f}")

    css = [
        f"text{{font-family:{mono};font-size:12px;fill:{ink}}}",
        f".corridor{{fill:{corridor};stroke:{corridor_line};stroke-width:1}}",
        ".glow{fill:none;stroke-linejoin:miter}",
        *[f".glow.w{i}{{stroke-width:{w};stroke-opacity:{o}}}" for i, (w, o) in enumerate(glow)],
        f".room{{stroke-width:{wall}}}",
        *[f".r-{r}{{stroke:{c}}} .room.r-{r}{{fill:{fills[r]}}}" for r, c in roles.items()],
        f".number{{font-size:17px;font-weight:bold;text-anchor:middle;fill:{ink}}}",
        f".gap,.gap-corridor{{fill:{corridor}}}",
        f".jamb,.dash{{stroke:{ink};stroke-width:1}}",
        ".dash{stroke-dasharray:2 2}",
        f".oneway{{fill:none;stroke:{ink};stroke-width:1.5}}",
        f".tag{{fill:{page};stroke:{gate};stroke-width:1}}",
        f".tag-letter{{font-size:10px;font-weight:bold;text-anchor:middle;fill:{gate}}}",
        f".glyph{{fill:none;stroke:{ink};stroke-width:1}}",
        ".title{font-size:18px;font-weight:bold}",
        f".muted{{fill:{muted}}}",
        ".heading{font-weight:bold}",
        f".rule{{stroke:{rule};stroke-width:1}}",
    ]
    svg = Path(svg_in).read_text()
    svg = re.sub(r"<style>.*?</style>", "<style>\n" + "\n".join(css) + "\n</style>", svg, flags=re.S)
    svg = re.sub(r'(<rect width="\d+" height="\d+" fill=")#[0-9a-f]{6}', rf"\g<1>{page}", svg, count=1)

    rooms = re.findall(r'<polygon class="room" points="([^"]+)"/>\n<text class="number" data-room="(\d+)"', svg)
    glows = [f'<polygon class="glow w{i} r-{by_number[int(n)]}" points="{p}"/>' for i in range(len(glow)) for p, n in rooms]
    first = svg.index('<polygon class="room"')
    svg = svg[:first] + "\n".join(glows) + "\n" + svg[first:]
    for p, n in rooms:
        svg = svg.replace(f'<polygon class="room" points="{p}"/>', f'<polygon class="room r-{by_number[int(n)]}" points="{p}"/>', 1)
    Path(svg_out).write_text(svg)
    print(f"{len(rooms)} rooms, {len(glows)} glow outlines, {len(svg)} bytes")


main(*sys.argv[1:])
