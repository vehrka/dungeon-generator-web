import type { GenerateOptions } from "../engine/generator/index";
import type { DungeonJson } from "../engine/types";
import { dungeonKey } from "../render/key";
import type { DrawRequest, DrawResult, View } from "./worker";
import { dungeonName, exportName, graphName, jsonName, keyName, layoutFailed, load, panelFor, parseSeed, parseSize, parseTheme, randomSeed, styleOf } from "./state";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const dungeonSeedField = $<HTMLInputElement>("dungeon-seed");
const sizeSelect = $<HTMLSelectElement>("size");
const themeSelect = $<HTMLSelectElement>("theme");
const generateButton = $<HTMLButtonElement>("generate");
const file = $<HTMLInputElement>("file");
const seedField = $<HTMLInputElement>("seed");
const rerollButton = $<HTMLButtonElement>("reroll");
const corridorsBox = $<HTMLInputElement>("corridors");
const svgButton = $<HTMLButtonElement>("export-svg");
const jsonButton = $<HTMLButtonElement>("export-json");
const keyButton = $<HTMLButtonElement>("export-key");
const viewButtons = { map: $<HTMLButtonElement>("view-map"), graph: $<HTMLButtonElement>("view-graph") };
const result = $<HTMLElement>("result");
const map = $<HTMLElement>("map");

type Options = Required<GenerateOptions>;
// The dungeon asked for last: reroll and corridors lay it out again, even if it never drew. Once the
// worker sends a generated dungeon back, source holds its JSON, so later layouts skip generation.
// options: set for a generated dungeon, none for a loaded file.
let current: { source: DrawRequest["source"]; name: string; options?: Options } | undefined;
// From the worker's replies, so exports always match what was drawn: the dungeon (JSON and key, also
// when its layout failed) and the map.
let dungeon: { json: DungeonJson; name: string; options?: Options } | undefined;
let drawn: { svg: string; file: string } | undefined;
// Kept across generate, load and reroll; not in the URL or storage.
let view: View = "map";
let worker: Worker | undefined;
let busy = false;
let opening = 0; // the latest load; an older file read that resolves late is dropped

// The loading bar shows while the worker runs, also under a panel error raised meanwhile.
function say(lines: string[], error = false) {
  result.parentElement!.classList.toggle("busy", busy);
  result.setAttribute("aria-busy", String(busy));
  result.replaceChildren(
    ...lines.map((line) => {
      const p = document.createElement("p");
      p.textContent = line;
      p.classList.toggle("error", error);
      return p;
    }),
  );
}

function clear() {
  map.replaceChildren();
  dungeon = drawn = undefined;
  svgButton.disabled = jsonButton.disabled = keyButton.disabled = true;
}

// A busy worker is terminated, which cancels a stuck layout; an idle one is reused.
function stop() {
  if (busy) {
    worker?.terminate();
    worker = undefined;
    busy = false;
  }
}

function fail(message: string) {
  stop();
  clear();
  say([message], true);
}

// The dungeon's theme picks the look. The graph needs no layout seed: undefined leaves the field
// as it is.
function run(seed: number | undefined, v = view) {
  const c = current;
  if (!c) return; // never after the first generate: a failed load keeps the dungeon before it
  if (v === "map" && seed === undefined) throw new Error("Enter a layout seed");
  const style = styleOf("json" in c.source ? c.source.json.theme : c.source.generate.theme);
  const file = v === "map" && seed !== undefined ? exportName(c.name, seed, style) : graphName(c.name);
  showView(v);
  stop();
  const w = (worker ??= new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }));
  busy = true;
  if (seed !== undefined) seedField.value = String(seed);
  svgButton.disabled = jsonButton.disabled = keyButton.disabled = true;
  say([v === "graph" ? `${"generate" in c.source ? "generating and drawing" : "drawing"} the graph of ${c.name}…` : `${"generate" in c.source ? "generating and laying out" : "laying out"} ${c.name}, layout seed ${seed}…`]);
  w.onmessage = (e: MessageEvent<DrawResult>) => {
    busy = false;
    if (e.data.json) c.source = { json: e.data.json }; // c is still current: a newer run terminates this worker
    const json = "json" in c.source ? c.source.json : undefined;
    dungeon = json && { json, name: c.name, options: c.options };
    keyButton.disabled = !dungeon;
    jsonButton.disabled = !dungeon?.options; // a loaded file is already on disk
    if ("error" in e.data) {
      map.replaceChildren();
      drawn = undefined;
      return say(e.data.stuck ? layoutFailed(e.data.stuck, c.options !== undefined) : [e.data.error], true);
    }
    map.innerHTML = e.data.svg; // render() escapes everything taken from the JSON
    drawn = { svg: e.data.svg, file };
    svgButton.disabled = false;
    say([c.name, `${e.data.rooms} rooms`, ...(c.options ? [`dungeon seed ${c.options.seed}`] : []), ...(v === "map" ? [`layout seed ${seed}`] : []), `${e.data.ms} ms`]);
  };
  w.onerror = (e) => {
    w.terminate();
    worker = undefined;
    busy = false;
    fail(e.message || "Layout worker failed");
  };
  w.postMessage({ source: c.source, seed, corridors: corridorsBox.checked, style, view: v } satisfies DrawRequest);
}

// Errors from the panel's fields go to the result block, the map stays as it is.
function attempt(f: () => void) {
  try {
    f();
  } catch (e) {
    say([(e as Error).message], true);
  }
}

// Generate from the panel's values; layoutSeed undefined resets the layout seed to the dungeon seed.
function generate(layoutSeed?: number) {
  const options = { seed: parseSeed(dungeonSeedField.value, "Dungeon seed"), size: parseSize(sizeSelect.value), theme: parseTheme(themeSelect.value) };
  opening++; // a file read still pending must not replace this dungeon
  dungeonSeedField.value = String(options.seed);
  current = { source: { generate: options }, name: dungeonName(options), options };
  run(layoutSeed ?? options.seed);
}

const layoutSeed = () => parseSeed(seedField.value);

// Size or theme changed. Theme is text and look only (step 13): the same seed and size give the
// same graph, so the layout seed shown is kept; anything else starts at the dungeon seed. On an error the
// selects go back to the dungeon shown, so the panel keeps matching the map.
function reselect(keepLayout: boolean) {
  try {
    const o = current?.options;
    const same = o !== undefined && o.seed === parseSeed(dungeonSeedField.value, "Dungeon seed") && o.size === sizeSelect.value;
    let seed: number | undefined;
    try {
      seed = keepLayout && same ? layoutSeed() : undefined;
    } catch {} // a bad layout seed field: start at the dungeon seed
    generate(seed);
  } catch (e) {
    if (current?.options) ({ size: sizeSelect.value, theme: themeSelect.value } = current.options);
    else if (current && "json" in current.source) showSelects(current.source.json);
    say([(e as Error).message], true);
  }
}

// A loaded file's size and theme; a theme the generator does not take is drawn plain, so the select
// says plain.
function showSelects(json: DungeonJson) {
  const panel = panelFor(json);
  if (panel.size) sizeSelect.value = panel.size;
  themeSelect.value = panel.theme ?? "plain";
}

async function open(f: File) {
  const n = ++opening;
  let loaded;
  try {
    loaded = load(await f.text(), f.name);
  } catch (e) {
    if (n === opening) say([(e as Error).message], true); // the dungeon before stays, map included
    return;
  }
  if (n !== opening) return;
  const panel = panelFor(loaded.json);
  dungeonSeedField.value = panel.seed === undefined ? "" : String(panel.seed);
  showSelects(loaded.json);
  current = { source: { json: loaded.json }, name: loaded.name };
  if (loaded.seed === undefined) seedField.value = "";
  if (loaded.seed === undefined && view === "map") fail(`${f.name} has no usable seed; enter a layout seed`);
  else run(loaded.seed);
}

function download(content: string, type: string, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href)); // revoking at once can cancel the download
}

// Generate draws a dungeon seed into the field, as reroll does the layout seed; Enter takes the typed one.
generateButton.addEventListener("click", () =>
  attempt(() => {
    dungeonSeedField.value = String(randomSeed());
    generate();
  }),
);
dungeonSeedField.addEventListener("keydown", (e) => {
  if (e.key === "Enter") attempt(() => generate());
});
sizeSelect.addEventListener("change", () => reselect(false));
themeSelect.addEventListener("change", () => reselect(true));

seedField.addEventListener("keydown", (e) => {
  if (e.key === "Enter") attempt(() => run(layoutSeed()));
});
rerollButton.addEventListener("click", () => attempt(() => run(randomSeed())));
corridorsBox.addEventListener("change", () => attempt(() => run(layoutSeed())));

// The toggle follows the view run draws, so a field error leaves it on the view shown.
function showView(v: View) {
  view = v;
  for (const w of ["map", "graph"] as const) viewButtons[w].setAttribute("aria-pressed", String(w === v));
}

// Map or graph of the same dungeon, at the layout seed shown (the graph needs none); reroll and
// corridors stay on in the graph (they change the map, the graph shows the same).
const typedSeed = () => {
  try {
    return layoutSeed();
  } catch {
    return undefined;
  }
};
for (const v of ["map", "graph"] as const)
  viewButtons[v].addEventListener("click", () => {
    if (v !== view) attempt(() => run(v === "graph" ? typedSeed() : layoutSeed(), v));
  });

file.addEventListener("change", () => {
  if (file.files?.[0]) void open(file.files[0]);
  file.value = ""; // loading the same file again still fires change
});

svgButton.addEventListener("click", () => {
  if (drawn) download(drawn.svg, "image/svg+xml", drawn.file);
});
jsonButton.addEventListener("click", () => {
  if (dungeon?.options) download(JSON.stringify(dungeon.json, null, 2) + "\n", "application/json", jsonName(dungeon.name));
});
keyButton.addEventListener("click", () => {
  const d = dungeon;
  if (d) attempt(() => download(dungeonKey(d.json), "text/markdown", keyName(d.name)));
});

// Drop anywhere on the page: a drop the page does not take makes the browser open the file.
document.addEventListener("dragover", (e) => {
  e.preventDefault();
  map.classList.add("drop");
});
document.addEventListener("dragleave", (e) => {
  if (!e.relatedTarget) map.classList.remove("drop");
});
document.addEventListener("drop", (e) => {
  e.preventDefault();
  map.classList.remove("drop");
  const f = e.dataTransfer?.files[0];
  if (f) void open(f);
});

// Opens with a dungeon: the panel's defaults, M, classic, seed 1.
attempt(() => generate());
