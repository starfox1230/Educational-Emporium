import React, { useEffect, useState } from "react";
import Stories from "./pages/Stories.jsx";
import Studio from "./pages/Studio.jsx";
import Reader from "./pages/Reader.jsx";
import { applyThemeById, loadSavedTheme } from "./theme.js";

function parseRoute() {
  const hash = window.location.hash.replace("#", "");
  return hash.split("/").filter(Boolean);
}

export default function App() {
  const [route, setRoute] = useState(parseRoute());

  useEffect(() => {
    const onHash = () => setRoute(parseRoute());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    const saved = loadSavedTheme();
    applyThemeById(saved);
  }, []);

  if (route.length === 0) return <Stories />;
  if (route[0] === "studio") return <Studio />;
  if (route[0] === "read" && route[1]) return <Reader storyId={route[1]} />;
  return <Stories />;
}
