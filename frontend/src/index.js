import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
// Side-effect import: applies the saved theme class to <html> before first
// render so the user never sees a flash of the wrong palette.
import "@/hooks/useTheme";
import App from "@/App";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
