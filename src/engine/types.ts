// Generator JSON, schema 2 (input)

export type GateKind = "lock" | "state" | "on" | "off" | "secret";

export type JsonRoomNode = {
  id: number;
  kind: "room";
  type: string;
  objects: string[];
  number: number;
  label: string;
};

export type JsonGateNode = {
  id: number;
  kind: "gate";
  type: string;
  gate: GateKind;
  requires: string[];
};

export type JsonNode = JsonRoomNode | JsonGateNode;

export type JsonEdge = { source: number; target: number; oneway: boolean };

export type JsonObject = { id: string; type: string; name: string; found_in: number[]; opens: number[] };

export type DungeonJson = {
  schema_version: number;
  seed: number;
  start: number;
  goal: number;
  nodes: JsonNode[];
  edges: JsonEdge[];
  objects: JsonObject[];
};

// Room graph (engine)

export type RoomId = number;

export type GameObject = { id: string; type: string; name: string };

export type Room = { id: RoomId; type: string; number: number; label: string; objects: GameObject[] };

export type Gate = { kind: GateKind; requires: GameObject[] };

export type Door = { a: RoomId; b: RoomId; oneway: boolean; gate?: Gate }; // oneway: a → b

export type RoomGraph = { rooms: Map<RoomId, Room>; doors: Door[]; start: RoomId; goal: RoomId };
