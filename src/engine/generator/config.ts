// Generator limits (Python utils/graph_utils.py MAXNODE, MAXITER; grammar/combined.py NEAR_BOSS).
// Separate from LayoutConfig: its own stage and seed.
export type GeneratorConfig = {
  maxNodes: number; // vertices, then finish mode
  maxIter: number; // expansions, then finish mode
  nearBoss: number; // rooms this many steps from a boss room use the last pacing tier
};

export const defaultGeneratorConfig: GeneratorConfig = { maxNodes: 300, maxIter: 200, nearBoss: 2 };
