export type LayoutConfig = {
  doorLength: number;
  cornerDistance: number; // a door never starts closer than this to a corner
  shapesPerType: number; // configuration spaces grow with the pool size squared
};

export const defaultConfig: LayoutConfig = {
  doorLength: 1,
  cornerDistance: 1,
  shapesPerType: 4,
};
