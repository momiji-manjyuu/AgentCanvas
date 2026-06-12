import "@xyflow/react/dist/style.css";
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initializeLocale } from "./i18n";
import "./styles.css";

const root = createRoot(document.getElementById("root") as HTMLElement);

void initializeLocale().finally(() => {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
