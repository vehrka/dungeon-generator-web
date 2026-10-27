import { defineConfig } from "vitest/config";

// The viewer lives in src/viewer (docs/plans/10-viewer.md); the build goes to dist/ at the root.
// Tests keep the project root, or vitest would look for them under src/viewer.
export default defineConfig({
  root: "src/viewer",
  build: { outDir: "../../dist", emptyOutDir: true },
  test: { root: import.meta.dirname },
});
