import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, shell } from "electron";
import { registerIpc } from "./ipc.js";
import { secureWebPreferences } from "./security.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

registerIpc();

async function createWindow(): Promise<void> {
  const preloadPath = path.join(__dirname, "..", "preload", "preload.js");
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    title: "AgentCanvas",
    backgroundColor: "#f6f7f9",
    webPreferences: secureWebPreferences(preloadPath),
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedAppNavigation(url)) {
      event.preventDefault();
    }
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    await window.loadURL(process.env.VITE_DEV_SERVER_URL);
    window.webContents.openDevTools({ mode: "detach" });
  } else {
    await window.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  }
}

app.whenReady().then(async () => {
  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

function isAllowedExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" || parsed.protocol === "mailto:";
  } catch {
    return false;
  }
}

function isAllowedAppNavigation(url: string): boolean {
  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    return url.startsWith(process.env.VITE_DEV_SERVER_URL);
  }
  try {
    return new URL(url).protocol === "file:";
  } catch {
    return false;
  }
}
