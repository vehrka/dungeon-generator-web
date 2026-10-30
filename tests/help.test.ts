import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import config from "../vite.config";

// The help page is static HTML (docs/plans/26-help-page.md); no DOM, so read the markup as text.
const viewer = join(import.meta.dirname, "..", "src", "viewer");
const page = (name: string) => readFileSync(join(viewer, name), "utf8");
const urls = (html: string) => [...html.matchAll(/\s(?:src|href)="([^"]+)"|\sfrom "([^"]+)"/g)].map((m) => (m[1] ?? m[2])!);
const local = (url: string) => !/^([a-z]+:|#)/.test(url);

describe("help page", () => {
  it("links both ways with the map page", () => {
    expect(urls(page("index.html"))).toContain("./help.html");
    expect(urls(page("help.html"))).toContain("./index.html");
  });

  it("has every local src, href and import on disk", () => {
    const missing = urls(page("help.html")).filter(local).map((u) => u.replace(/[?#].*$/, "")).filter((u) => !existsSync(resolve(viewer, u)));
    expect(missing).toEqual([]);
  });

  it("has the grammar sheet from docs/, not a copy", () => {
    expect(urls(page("help.html"))).toContain("../../docs/grammar.svg?url");
  });

  it("is a build input beside the map page", () => {
    const input = config.build?.rolldownOptions?.input as Record<string, string>;
    expect(Object.values(input).map((p) => resolve(p)).sort()).toEqual([join(viewer, "help.html"), join(viewer, "index.html")]);
  });

  it("has five numbered section bands in order", () => {
    const bands = [...page("help.html").matchAll(/<h2><span class="n">(\d+)<\/span>/g)].map((m) => Number(m[1]));
    expect(bands).toEqual([1, 2, 3, 4, 5]);
  });
});
