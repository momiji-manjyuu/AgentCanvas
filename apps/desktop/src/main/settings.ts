import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { atomicWrite, pathExists } from "@agent-canvas/core";

export type AppLocale = "en" | "ja";

export interface AppSettings {
  locale: AppLocale | null;
}

export function normalizeLocale(value: unknown): AppLocale | null {
  return value === "en" || value === "ja" ? value : null;
}

export function normalizeSettings(value: unknown): AppSettings {
  if (!value || typeof value !== "object") {
    return { locale: null };
  }
  return { locale: normalizeLocale((value as { locale?: unknown }).locale) };
}

export async function readSettings(filePath: string): Promise<AppSettings> {
  if (!(await pathExists(filePath))) {
    return { locale: null };
  }
  try {
    const raw = await readFile(filePath, "utf8");
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return { locale: null };
  }
}

export async function saveLocaleSetting(filePath: string, locale: AppLocale): Promise<AppSettings> {
  const settings: AppSettings = { locale };
  await mkdir(path.dirname(filePath), { recursive: true });
  await atomicWrite(filePath, `${JSON.stringify(settings, null, 2)}\n`);
  return settings;
}
