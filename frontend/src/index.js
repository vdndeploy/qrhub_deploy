import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

const root = ReactDOM.createRoot(document.getElementById("root"));
// Activate dark theme site-wide. Marketing + dashboard share the dark + lime
// palette; the public vendor landing keeps its own org-branded styling.
document.documentElement.classList.add("dark");
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
