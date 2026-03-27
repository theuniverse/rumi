import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { initDB } from "./lib/db";

const root = document.getElementById("root")!;

// Show a minimal loading state while SQLite WASM loads
root.innerHTML = `
  <div style="height:100%;display:flex;align-items:center;justify-content:center;">
    <span style="font-family:monospace;font-size:0.75rem;color:#444;letter-spacing:0.1em;">
      loading…
    </span>
  </div>
`;

initDB()
  .then(() => {
    root.innerHTML = "";
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  })
  .catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    root.innerHTML = `
      <div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:32px;">
        <span style="font-family:monospace;font-size:0.75rem;color:#c45858;">SQLite failed to load</span>
        <span style="font-family:monospace;font-size:0.65rem;color:#444;max-width:320px;text-align:center;">${msg}</span>
        <span style="font-family:monospace;font-size:0.65rem;color:#3a3a3a;">Try running <code>npm install</code> and refreshing.</span>
      </div>
    `;
  });
