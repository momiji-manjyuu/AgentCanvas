import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  normalizeLocale,
  normalizeSettings,
  readSettings,
  saveLocaleSetting,
} from "../src/main/settings.js";

describe("settings", () => {
  it("normalizes locale values", () => {
    expect(normalizeLocale("ja")).toBe("ja");
    expect(normalizeLocale("en")).toBe("en");
    expect(normalizeLocale("fr")).toBeNull();
    expect(normalizeLocale(null)).toBeNull();
  });

  it("normalizes settings objects", () => {
    expect(normalizeSettings({ locale: "en" })).toEqual({ locale: "en" });
    expect(normalizeSettings({ locale: "de" })).toEqual({ locale: null });
    expect(normalizeSettings([])).toEqual({ locale: null });
  });

  it("reads missing or invalid settings as empty settings", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agentcanvas-settings-"));
    try {
      expect(await readSettings(path.join(dir, "missing.json"))).toEqual({ locale: null });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("writes locale settings with stable shape", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "agentcanvas-settings-"));
    const filePath = path.join(dir, "settings.json");
    try {
      await expect(saveLocaleSetting(filePath, "ja")).resolves.toEqual({ locale: "ja" });
      expect(JSON.parse(await readFile(filePath, "utf8"))).toEqual({ locale: "ja" });
      await expect(readSettings(filePath)).resolves.toEqual({ locale: "ja" });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
