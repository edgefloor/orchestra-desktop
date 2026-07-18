import React from "react";
import ReactDOM from "react-dom/client";

import "../index.css";

import { AppAtomRegistryProvider } from "../rpc/atomRegistry";
import { OrchestraWorkspaceAcceptanceFixture } from "./OrchestraWorkspaceAcceptanceFixture";

const parameters = new URLSearchParams(window.location.search);
const theme = parameters.get("theme") === "light" ? "light" : "dark";
const state =
  parameters.get("state") === "attention-sheet"
    ? "attention-sheet"
    : parameters.get("state") === "symphony"
      ? "symphony"
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
