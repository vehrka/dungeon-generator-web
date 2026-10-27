export type LayoutConfig = {
  doorLength: number;
  cornerDistance: number; // a door never starts closer than this to a corner
  shapesPerType: number; // rectangles; configuration spaces grow with the pool size squared
  lShapes: number; // base shapes per pool key, each with its distinct rotations
  tShapes: number;
  plusShapes: number;
  minArm: number; // thinnest arm of an L, T or plus
  minNotch: number; // shallowest cut-out of an L, T or plus
  hubDegree: number; // rooms with more neighbours get bigger shapes
  hubGrowth: number; // added to both size bounds per neighbour above hubDegree
  maxTreeSize: number;
  maxBranching: number; // layouts the planner asks of each chain before backtracking
  cycles: number; // simulated annealing
  trialsPerCycle: number;
  maxIterationsWithoutSuccess: number; // per chain, since the last layout it returned
  shapePerturbChance: number; // else move the room
  differenceScale: number; // layouts of one chain must differ by 1 / differenceScale
  greedyMaxPoints: number; // sampled per configuration space segment
  maxTotalIterations: number; // then one retry with 4×, then LayoutError
  corridors: boolean;
  corridorRate: number; // chance per room pair of a corridor instead of a direct door
  corridorLengths: number[]; // straight, doorLength wide
  roomsCanTouch: boolean; // false: rooms without a direct door must not share a wall or corner
  maxStageTwoFailures: number; // per chain, corridors that could not be placed
};

// Edgar's defaults, except our own iteration cap and cornerDistance 0 (doors may touch a corner):
// small rooms need every door position they can get (docs/design.md, door capacity). Hub sizing is
// ours: Edgar's hand-made templates have no size rule. Edgar puts a corridor on every connection;
// 0.95 leaves a few rooms touching. Corridor lengths as Edgar's examples (Resources/Rooms/corridors.yml).
// L/T/plus families are ours (Edgar's are hand-made); plus off: on the bench it fails M-3 with
// corridors and doubles the time. minNotch 2: 1-deep cut-outs read as dents (docs/plans/12-lt-shapes.md).
export const defaultConfig: LayoutConfig = {
  doorLength: 1,
  cornerDistance: 0,
  shapesPerType: 4,
  lShapes: 1,
  tShapes: 1,
  plusShapes: 0,
  minArm: 2,
  minNotch: 2,
  hubDegree: 4,
  hubGrowth: 1,
  maxTreeSize: 8,
  maxBranching: 5,
  cycles: 50,
  trialsPerCycle: 100,
  maxIterationsWithoutSuccess: 100,
  shapePerturbChance: 0.4,
  differenceScale: 0.4,
  greedyMaxPoints: 20,
  maxTotalIterations: 100_000,
  corridors: true,
  corridorRate: 0.95,
  corridorLengths: [1, 3, 5],
  roomsCanTouch: true,
  maxStageTwoFailures: 10_000,
};
