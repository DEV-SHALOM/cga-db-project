// src/main.jsx
import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";              // ✅ make sure Tailwind styles load
import App from "./App.jsx";

const el = document.getElementById("root");
const root = createRoot(el);
root.render(<App />);

console.log("React runtime version:", React.version);
