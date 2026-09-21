import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./app.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("#root 要素が見つかりません。");
}

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
