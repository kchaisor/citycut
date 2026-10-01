import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./theme.css";
import "./drawing-style.css";
import "./colours.css";
import "@fontsource/outfit/400.css";
import "@fontsource/outfit/500.css";
import "@fontsource/outfit/600.css";
import "@fontsource/fraunces/500.css";
import "maplibre-gl/dist/maplibre-gl.css";
import App from "./App";
import "./index.css";
import { hydrateStoredColours } from "./lib/colours";
import { hydrateStoredLineStyles } from "./lib/drawingStyle";

hydrateStoredLineStyles();
hydrateStoredColours();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
