import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

// The viewer lives in src/viewer (docs/plans/10-viewer.md); the build goes to dist/ at the root.
// Two pages: the map and the help page (docs/plans/26-help-page.md).
// Tests keep the project root, or vitest would look for them under src/viewer.
// Relative base: GitHub Pages serves the site under /<repo>/, not at the root.
const viewer = resolve(import.meta.dirname, "src/viewer");
export default defineConfig({
  root: "src/viewer",
  base: "./",
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
    rolldownOptions: { input: { index: resolve(viewer, "index.html"), help: resolve(viewer, "help.html") } },
  },
  test: { root: import.meta.dirname },
});
