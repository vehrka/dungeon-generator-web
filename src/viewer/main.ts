import type { GenerateOptions } from "../engine/generator/index";
import type { DungeonJson } from "../engine/types";
import { styleFor, type MapStyle } from "../render/svg";
import { dungeonKey } from "../render/key";
import type { DrawRequest, DrawResult } from "./worker";
import { dungeonName, exportName, jsonName, keyName, layoutFailed, load, panelFor, parseSeed, parseSize, parseStyle, parseTheme, randomSeed } from "./state";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const dungeonSeedField = $<HTMLInputElement>("dungeon-seed");
const sizeSelect = $<HTMLSelectElement>("size");
const themeSelect = $<HTMLSelectElement>("theme");
const generateButton = $<HTMLButtonElement>("generate");
const file = $<HTMLInputElement>("file");
const seedField = $<HTMLInputElement>("seed");
const rerollButton = $<HTMLButtonElement>("reroll");
const corridorsBox = $<HTMLInputElement>("corridors");
const styleSelect = $<HTMLSelectElement>("style");
const svgButton = $<HTMLButtonElement>("export-svg");
const jsonButton = $<HTMLButtonElement>("export-json");
const keyButton = $<HTMLButtonElement>("export-key");
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
let drawn: { svg: string; seed: number; style: MapStyle } | undefined;
// The theme the style select was last preset from, lower case: generate keeps a style picked by hand
// until the theme changes; a load always presets.
let styleTheme: string | undefined;
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

// A loaded JSON's theme is unchecked: anything but a string counts as none.
function presetStyle(theme: unknown, always: boolean) {
  const t = typeof theme === "string" ? theme.toLowerCase() : undefined;
  if (!always && t === styleTheme) return;
  styleTheme = t;
  styleSelect.value = styleFor(t);
}

const selectedStyle = () => parseStyle(styleSelect.value);

// Callers that change current parse the style first, so a bad select leaves the dungeon as it was.
function run(seed: number, style = selectedStyle()) {
  const c = current;
  if (!c) return; // never after the first generate: a failed load keeps the dungeon before it
  stop();
  const w = (worker ??= new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }));
  busy = true;
  seedField.value = String(seed);
  svgButton.disabled = jsonButton.disabled = keyButton.disabled = true;
  say([`${"generate" in c.source ? "generating and laying out" : "laying out"} ${c.name}, layout seed ${seed}…`]);
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
    drawn = { svg: e.data.svg, seed, style };
    svgButton.disabled = false;
    say([c.name, `${e.data.rooms} rooms`, ...(c.options ? [`dungeon seed ${c.options.seed}`] : []), `layout seed ${seed}`, `${e.data.ms} ms`]);
  };
  w.onerror = (e) => {
    w.terminate();
    worker = undefined;
    busy = false;
    fail(e.message || "Layout worker failed");
  };
  w.postMessage({ source: c.source, seed, corridors: corridorsBox.checked, style } satisfies DrawRequest);
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
  presetStyle(options.theme, false);
  const style = selectedStyle();
  opening++; // a file read still pending must not replace this dungeon
  dungeonSeedField.value = String(options.seed);
  current = { source: { generate: options }, name: dungeonName(options), options };
  run(layoutSeed ?? options.seed, style);
}

const layoutSeed = () => parseSeed(seedField.value);

// Size or theme changed. Theme is text only (step 13): the same seed and size give the same graph,
// so the layout seed shown is kept; anything else starts at the dungeon seed. On an error the
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
    say([(e as Error).message], true);
  }
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
  presetStyle(loaded.json.theme, true); // the select now holds a valid style
  const panel = panelFor(loaded.json);
  dungeonSeedField.value = panel.seed === undefined ? "" : String(panel.seed);
  if (panel.size) sizeSelect.value = panel.size;
  if (panel.theme) themeSelect.value = panel.theme;
  current = { source: { json: loaded.json }, name: loaded.name };
  if (loaded.seed === undefined) {
    fail(`${f.name} has no usable seed; enter a layout seed`);
    seedField.value = "";
  } else {
    run(loaded.seed);
  }
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
styleSelect.addEventListener("change", () => attempt(() => run(layoutSeed())));

file.addEventListener("change", () => {
  if (file.files?.[0]) void open(file.files[0]);
  file.value = ""; // loading the same file again still fires change
});

svgButton.addEventListener("click", () => {
  if (drawn && dungeon) download(drawn.svg, "image/svg+xml", exportName(dungeon.name, drawn.seed, drawn.style));
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

// Opens with a dungeon: the panel's defaults, M, zelda, seed 1.
attempt(() => generate());
