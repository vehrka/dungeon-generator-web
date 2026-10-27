import type { GenerateOptions } from "../engine/generator/index";
import type { DungeonJson } from "../engine/types";
import { dungeonKey } from "../render/key";
import type { DrawRequest, DrawResult } from "./worker";
import { dungeonName, exportName, jsonName, keyName, load, parseSeed, parseSize, parseTheme, randomSeed } from "./state";

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
const result = $<HTMLElement>("result");
const map = $<HTMLElement>("map");

type Source = { json: DungeonJson } | { generate: Required<GenerateOptions> };
// The dungeon asked for last: reroll and corridors lay it out again, even if it never drew.
let current: { source: Source; name: string } | undefined;
// What the map shows, from the worker's reply, so exports always match it.
let shown: { json: DungeonJson; name: string; generated: boolean; svg: string; seed: number } | undefined;
let worker: Worker | undefined;
let busy = false;
let opening = 0; // the latest load; an older file read that resolves late is dropped

function say(lines: string[], error = false) {
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
  shown = undefined;
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

function run(seed: number) {
  if (!current) return;
  const { source, name } = current;
  const generated = "generate" in source;
  stop();
  const w = (worker ??= new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }));
  busy = true;
  seedField.value = String(seed);
  svgButton.disabled = jsonButton.disabled = keyButton.disabled = true;
  say([`${generated ? "generating and laying out" : "laying out"} ${name}, layout seed ${seed}…`]);
  w.onmessage = (e: MessageEvent<DrawResult>) => {
    busy = false;
    if ("error" in e.data) return fail(e.data.error);
    map.innerHTML = e.data.svg; // render() escapes everything taken from the JSON
    shown = { json: e.data.json, name, generated, svg: e.data.svg, seed };
    svgButton.disabled = keyButton.disabled = false;
    jsonButton.disabled = !generated; // a loaded file is already on disk
    say([
      name,
      `${e.data.rooms} rooms`,
      ...("generate" in source ? [`dungeon seed ${source.generate.seed}`] : []),
      `layout seed ${seed}`,
      `${e.data.ms} ms`,
    ]);
  };
  w.onerror = (e) => {
    w.terminate();
    worker = undefined;
    busy = false;
    fail(e.message || "Layout worker failed");
  };
  w.postMessage({ source, seed, corridors: corridorsBox.checked } satisfies DrawRequest);
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
  dungeonSeedField.value = String(options.seed);
  current = { source: { generate: options }, name: dungeonName(options) };
  run(layoutSeed ?? options.seed);
}

const layoutSeed = () => parseSeed(seedField.value);

async function open(f: File) {
  const n = ++opening;
  let loaded;
  try {
    loaded = load(await f.text(), f.name);
  } catch (e) {
    if (n !== opening) return;
    current = undefined;
    fail((e as Error).message);
    return;
  }
  if (n !== opening) return;
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
sizeSelect.addEventListener("change", () => attempt(() => generate()));
// Theme is text only (step 13): same graph, so the layout seed shown is kept.
themeSelect.addEventListener("change", () => attempt(() => generate(seedField.value.trim() ? layoutSeed() : undefined)));

seedField.addEventListener("keydown", (e) => {
  if (e.key === "Enter") attempt(() => run(layoutSeed()));
});
rerollButton.addEventListener("click", () => run(randomSeed()));
corridorsBox.addEventListener("change", () => attempt(() => run(layoutSeed())));

file.addEventListener("change", () => {
  if (file.files?.[0]) void open(file.files[0]);
  file.value = ""; // loading the same file again still fires change
});

svgButton.addEventListener("click", () => {
  if (shown) download(shown.svg, "image/svg+xml", exportName(shown.name, shown.seed));
});
jsonButton.addEventListener("click", () => {
  if (shown?.generated) download(JSON.stringify(shown.json, null, 2) + "\n", "application/json", jsonName(shown.name));
});
keyButton.addEventListener("click", () => {
  const s = shown;
  if (s) attempt(() => download(dungeonKey(s.json), "text/markdown", keyName(s.name)));
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
