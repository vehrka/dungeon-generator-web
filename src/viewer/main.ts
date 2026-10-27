import type { DrawRequest, DrawResult } from "./worker";
import { exportName, load, parseSeed, reroll, type Loaded } from "./state";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const file = $<HTMLInputElement>("file");
const seedField = $<HTMLInputElement>("seed");
const rerollButton = $<HTMLButtonElement>("reroll");
const exportButton = $<HTMLButtonElement>("export");
const status = $<HTMLParagraphElement>("status");
const map = $<HTMLElement>("map");

let dungeon: Loaded | undefined;
let shown: { svg: string; seed: number } | undefined;
let worker: Worker | undefined;
let busy = false;
let opening = 0; // the latest load; an older file read that resolves late is dropped

function say(message: string, error = false) {
  status.textContent = message;
  status.classList.toggle("error", error);
}

function clear() {
  map.replaceChildren();
  shown = undefined;
  exportButton.disabled = true;
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
  say(message, true);
}

function run(seed: number) {
  if (!dungeon) return;
  const { json, name } = dungeon;
  stop();
  const w = (worker ??= new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }));
  busy = true;
  seedField.value = String(seed);
  exportButton.disabled = true;
  say(`laying out ${name}, layout seed ${seed}…`);
  w.onmessage = (e: MessageEvent<DrawResult>) => {
    busy = false;
    if ("error" in e.data) return fail(e.data.error);
    map.innerHTML = e.data.svg; // render() escapes everything taken from the JSON
    shown = { svg: e.data.svg, seed };
    exportButton.disabled = false;
    say(`${name}  ·  ${e.data.rooms} rooms  ·  layout seed ${seed}  ·  ${e.data.ms} ms`);
  };
  w.onerror = (e) => {
    w.terminate();
    worker = undefined;
    busy = false;
    fail(e.message || "Layout worker failed");
  };
  w.postMessage({ json, seed } satisfies DrawRequest);
}

// Reroll steps the seed in the field, the one the user sees, not the last one drawn.
function withSeed(f: (seed: number) => void) {
  try {
    f(parseSeed(seedField.value));
  } catch (e) {
    say((e as Error).message, true);
  }
}

async function open(f: File) {
  const n = ++opening;
  let loaded: Loaded;
  try {
    loaded = load(await f.text(), f.name);
  } catch (e) {
    if (n !== opening) return;
    dungeon = undefined;
    seedField.disabled = rerollButton.disabled = true;
    fail((e as Error).message);
    return;
  }
  if (n !== opening) return;
  dungeon = loaded;
  seedField.disabled = rerollButton.disabled = false;
  if (loaded.seed === undefined) {
    fail(`${f.name} has no usable seed; enter a layout seed`);
    seedField.value = "";
  } else {
    run(loaded.seed);
  }
}

file.addEventListener("change", () => {
  if (file.files?.[0]) void open(file.files[0]);
  file.value = ""; // loading the same file again still fires change
});
seedField.addEventListener("keydown", (e) => {
  if (e.key === "Enter") withSeed(run);
});
rerollButton.addEventListener("click", () => withSeed((s) => run(reroll(s))));
exportButton.addEventListener("click", () => {
  if (!shown || !dungeon) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([shown.svg], { type: "image/svg+xml" }));
  a.download = exportName(dungeon.name, shown.seed);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href)); // revoking at once can cancel the download
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
