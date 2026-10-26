export type LayoutConfig = {
  doorLength: number;
  cornerDistance: number; // a door never starts closer than this to a corner
  shapesPerType: number; // configuration spaces grow with the pool size squared
  maxTreeSize: number;
  maxBranching: number; // layouts the planner asks of each chain before backtracking
  cycles: number; // simulated annealing
  trialsPerCycle: number;
  maxIterationsWithoutSuccess: number; // per chain, since the last layout it returned
  shapePerturbChance: number; // else move the room
  differenceScale: number; // layouts of one chain must differ by 1 / differenceScale
  greedyMaxPoints: number; // sampled per configuration space segment
  maxTotalIterations: number; // then one retry with 4×, then LayoutError
};

// Edgar's defaults, except our own iteration cap and cornerDistance 0 (doors may touch a corner):
// small rooms need every door position they can get (docs/design.md, door capacity).
export const defaultConfig: LayoutConfig = {
  doorLength: 1,
  cornerDistance: 0,
  shapesPerType: 4,
  maxTreeSize: 8,
  maxBranching: 5,
  cycles: 50,
  trialsPerCycle: 100,
  maxIterationsWithoutSuccess: 100,
  shapePerturbChance: 0.4,
  differenceScale: 0.4,
  greedyMaxPoints: 20,
  maxTotalIterations: 100_000,
};
