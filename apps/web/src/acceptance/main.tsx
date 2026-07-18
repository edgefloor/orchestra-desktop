import React from "react";
import ReactDOM from "react-dom/client";

import "../index.css";

import { AppAtomRegistryProvider } from "../rpc/atomRegistry";
import { OrchestraWorkspaceAcceptanceFixture } from "./OrchestraWorkspaceAcceptanceFixture";

const parameters = new URLSearchParams(window.location.search);
const theme = parameters.get("theme") === "light" ? "light" : "dark";
const requestedState = parameters.get("state");
const state =
  requestedState === "attention-sheet" ||
  requestedState === "symphony" ||
  requestedState === "symphony-activity" ||
  requestedState === "symphony-recovery" ||
  requestedState === "symphony-events" ||
  requestedState === "browser-preview" ||
  requestedState === "browser-preview-narrow" ||
  requestedState === "file-preview"
    ? requestedState
    : "workspace";
document.documentElement.classList.toggle("dark", theme === "dark");
document.documentElement.style.colorScheme = theme;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AppAtomRegistryProvider>
      <OrchestraWorkspaceAcceptanceFixture state={state} />
    </AppAtomRegistryProvider>
  </React.StrictMode>,
);
