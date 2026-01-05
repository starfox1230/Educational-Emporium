export const THEMES = [
  {
    id: "midnight-glow",
    name: "Midnight Glow",
    description: "Deep blues with neon mint highlights (default)",
    vars: {
      "--bg": "#0b0f17",
      "--card": "#121a26",
      "--text": "#e7eefc",
      "--muted": "#9bb0d0",
      "--accent": "#66a6ff",
      "--accent2": "#7ef0c3",
      "--danger": "#ff6b6b",
      "--border": "rgba(255,255,255,0.08)",
      "--progress-story": "#66a6ff",
      "--progress-sentence": "#7ef0c3",
      "--progress-track": "rgba(255,255,255,0.12)",
    },
  },
  {
    id: "violet-night",
    name: "Violet Night",
    description: "Moody purples with electric lavender glows",
    vars: {
      "--bg": "#0d0a14",
      "--card": "#171124",
      "--text": "#f0eaff",
      "--muted": "#b7acd9",
      "--accent": "#a06bff",
      "--accent2": "#7bd0ff",
      "--danger": "#ff7b9c",
      "--border": "rgba(255,255,255,0.09)",
      "--progress-story": "#a06bff",
      "--progress-sentence": "#7bd0ff",
      "--progress-track": "rgba(255,255,255,0.14)",
    },
  },
  {
    id: "neon-blush",
    name: "Neon Blush",
    description: "Modern pinks with punchy cyan accents",
    vars: {
      "--bg": "#0e0a0d",
      "--card": "#191118",
      "--text": "#fff4fb",
      "--muted": "#d6b4cc",
      "--accent": "#ff6fb7",
      "--accent2": "#5ee0ff",
      "--danger": "#ff8f8f",
      "--border": "rgba(255,255,255,0.1)",
      "--progress-story": "#ff6fb7",
      "--progress-sentence": "#5ee0ff",
      "--progress-track": "rgba(255,255,255,0.16)",
    },
  },
  {
    id: "pastel-aurora",
    name: "Pastel Aurora",
    description: "Soft gradients with airy mint and peach",
    vars: {
      "--bg": "#0c1215",
      "--card": "#121b1f",
      "--text": "#f4fbff",
      "--muted": "#b7cbd5",
      "--accent": "#9ad5ff",
      "--accent2": "#ffd0b5",
      "--danger": "#ff9e9e",
      "--border": "rgba(255,255,255,0.07)",
      "--progress-story": "#9ad5ff",
      "--progress-sentence": "#ffd0b5",
      "--progress-track": "rgba(255,255,255,0.12)",
    },
  },
  {
    id: "sunset-peaks",
    name: "Sunset Peaks",
    description: "Warm amber base with coral and teal highlights",
    vars: {
      "--bg": "#0f0c0a",
      "--card": "#181310",
      "--text": "#fff3e8",
      "--muted": "#d2b8a8",
      "--accent": "#ff9966",
      "--accent2": "#5ad4c2",
      "--danger": "#ff7878",
      "--border": "rgba(255,255,255,0.08)",
      "--progress-story": "#ff9966",
      "--progress-sentence": "#5ad4c2",
      "--progress-track": "rgba(255,255,255,0.15)",
    },
  },
];

export const THEME_STORAGE_KEY = "wordglow-theme";

export function applyThemeById(themeId) {
  const theme = THEMES.find(t => t.id === themeId) || THEMES[0];
  const root = document.documentElement;
  Object.entries(theme.vars).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
  return theme.id;
}

export function loadSavedTheme() {
  if (typeof localStorage === "undefined") return THEMES[0].id;
  return localStorage.getItem(THEME_STORAGE_KEY) || THEMES[0].id;
}

export function saveTheme(themeId) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(THEME_STORAGE_KEY, themeId);
}
