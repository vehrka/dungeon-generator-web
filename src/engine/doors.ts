import type { LayoutConfig } from "./config";
import { segment, walls, type Point, type Polygon, type Segment } from "./geometry";

// Possible door start positions on one wall. A door starting at q covers q → q + length along the
// wall; normal points out of the room.
export type DoorLine = { line: Segment; length: number; normal: Point };

// Edgar's simple door mode (Doors/SimpleMode/SimpleModeHandler.cs): every wall long enough becomes
// a door line, shrunk so no door comes closer than cornerDistance to a corner.
export function doorLines(outline: Polygon, config: Pick<LayoutConfig, "doorLength" | "cornerDistance">): DoorLine[] {
  const { doorLength, cornerDistance } = config;
  return walls(outline).flatMap((w) => {
    const axis = w.from.y === w.to.y ? "x" : "y";
    if (w.to[axis] - w.from[axis] < 2 * cornerDistance + doorLength) return [];
    const from = { ...w.from, [axis]: w.from[axis] + cornerDistance };
    const to = { ...w.to, [axis]: w.to[axis] - cornerDistance - doorLength };
    return [{ line: segment(from, to), length: doorLength, normal: w.normal }];
  });
}
