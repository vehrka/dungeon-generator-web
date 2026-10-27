import { randInt, rng } from "../rng";
import type { GateKind } from "../types";
import type { GeneratorConfig } from "./config";
import { BOSS_ROOMS, chooseVariant, finishVariant, GATE_KINDS, pacedRoomVariant, type EdgeKind, type NodeKind, type Preset, type Variant } from "./grammar";
import { Graph } from "./graph";
import { progress, steps } from "./solve";
import { rewardVariant, type Theme } from "./themes";
import type { DGraph, DVertex, GObject } from "./types";

type Anchor = [vertex: number, oneway: boolean];

// Python dungeon_fx11.py DCombined: START and GOAL, the Start rule between them, then each
// non-terminal (first in vertex order, R last so pacing sees the final layout) is replaced by the
// subgraph of a variant, one d20 each. Past maxNodes or maxIter, recursive rules finish.
export function expand(seed: number, preset: Preset, theme: Theme, config: GeneratorConfig): DGraph {
  const g: DGraph = new Graph();
  const r = rng(seed, "generator/d20");
  const d20 = () => randInt(r, 1, 20);
  const counts = new Map<string, number>();
  const add = (v: Partial<DVertex> & { type: string }) => g.addVertex({ name: v.type, nt: false, objects: [], ...v });

  const newObject = (type: string, name: string): GObject => {
    const n = (counts.get(type) ?? 0) + 1;
    counts.set(type, n);
    return { id: `${type}-${n}`, type, name: `${theme.objects[type] ?? name} ${n}` };
  };

  const addNode = (kind: NodeKind, label: string, objects: Map<string, GObject>): number => {
    const o = objects.get(label);
    if (kind === "nt") return add({ type: label, nt: true });
    if (kind === "item") return add({ type: o!.type, name: `Get ${o!.name}`, objects: [o!] });
    if (kind === "switch") return add({ type: o!.type, name: o!.name, objects: [o!] });
    if (kind === "special") return add({ type: label.toLowerCase(), name: label });
    return add({ type: label });
  };

  // Gates become a vertex between the two ends. Fix of Python _add_link: both legs share oneway.
  const addLink = (s: number, d: number, kind: EdgeKind, objects: GObject[], oneway: boolean) => {
    oneway ||= kind === "one";
    if (!GATE_KINDS.includes(kind)) {
      g.addEdge(s, d, { oneway });
      return;
    }
    const names = objects.map((o) => o.name).join(" + ");
    const gate = kind as GateKind;
    const v =
      gate === "lock"
        ? add({ type: "lock", name: `Use ${names}`, objects, gate })
        : gate === "secret"
          ? add({ type: "s", name: "secret", gate })
          : add({ type: "gate", name: `Check ${names}${gate === "state" ? "" : ` ${gate.toUpperCase()}`}`, objects, gate });
    g.addEdge(s, v, { oneway });
    g.addEdge(v, d, { oneway });
  };

  // "prev" joins every in-neighbour of the replaced vertex, "next" every out-neighbour.
  const apply = (variant: Variant, ins: Anchor[], outs: Anchor[]) => {
    const objects = new Map(Object.entries(variant.objects ?? {}).map(([id, [type, name]]) => [id, newObject(type, name)]));
    const ids = new Map(variant.nodes.map(([id, kind, label]) => [id, addNode(kind, label, objects)]));
    for (const [src, dst, kind, ...oids] of variant.edges) {
      const sources: Anchor[] = src === "prev" ? ins : [[ids.get(src)!, false]];
      const targets: Anchor[] = dst === "next" ? outs : [[ids.get(dst)!, false]];
      const gateObjects = oids.map((o) => objects.get(o)!);
      for (const [s, so] of sources) for (const [d, dO] of targets) addLink(s, d, kind, gateObjects, so || dO);
    }
  };

  // Rooms near a mini-boss or the boss count as the end.
  const pace = (v: number): number => {
    const bosses = g.vertices().flatMap(([id, x]) => (BOSS_ROOMS.includes(x.type) ? [id] : []));
    return Math.min(...steps(g, v, bosses)) <= config.nearBoss ? 1 : progress(g, v);
  };

  const next = (): number | undefined => {
    const nts = g.vertices().filter(([, x]) => x.nt);
    return (nts.find(([, x]) => x.type !== "R") ?? nts[0])?.[0];
  };

  let finishing = false;
  const expandVertex = (v: number) => {
    const { type } = g.vertex(v);
    const variant =
      type === "R"
        ? pacedRoomVariant(pace(v), d20())
        : type === "GB"
          ? rewardVariant(theme, d20())
          : (finishing ? finishVariant : chooseVariant)(type, preset, d20());
    apply(
      variant,
      g.incident(v, "in").map((e) => [e.source, e.attrs.oneway]),
      g.incident(v, "out").map((e) => [e.target, e.attrs.oneway]),
    );
    g.deleteVertex(v);
  };

  const start = add({ type: "st", name: "START" });
  const goal = add({ type: "gl", name: "GOAL" });
  apply(chooseVariant("Start", preset, d20()), [[start, false]], [[goal, false]]);
  for (let iter = 1, v = next(); v !== undefined; iter++, v = next()) {
    expandVertex(v);
    finishing ||= g.vertexCount >= config.maxNodes || iter >= config.maxIter;
  }
  return g;
}
