import type { GateKind } from "../types";
import type { Graph } from "./graph";

export type GObject = { id: string; type: string; name: string };
// nt: non-terminal still to expand. gate: set on gate vertices, whose objects are what they require.
export type DVertex = { type: string; name: string; nt: boolean; objects: GObject[]; gate?: GateKind };
export type DEdge = { oneway: boolean };
export type DGraph = Graph<DVertex, DEdge>;
