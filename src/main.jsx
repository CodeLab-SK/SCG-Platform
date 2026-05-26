import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const root = document.getElementById("root");
root.innerHTML = `
  <div class="loading">
    <strong>Starting SSG Study Platform...</strong>
    <span>Loading the React application.</span>
  </div>
`;

import("./App.jsx")
  .then(({ default: App }) => {
    createRoot(root).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  })
  .catch((error) => {
    root.innerHTML = `
      <div class="loading">
        <strong>Frontend startup failed</strong>
        <span>${error.message || error}</span>
      </div>
    `;
    console.error(error);
  });
