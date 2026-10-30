import { readFileSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
const [inp, out] = process.argv.slice(2);
writeFileSync(out, new Resvg(readFileSync(inp, "utf8"), { font: { loadSystemFonts: true } }).render().asPng());
