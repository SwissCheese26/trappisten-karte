// Sprachwahl: Deutsch ist die Quellsprache. Übersetzte Inhalte liegen
// spiegelbildlich unter data/<lang>/..., gleiche Dateinamen und Struktur.
// Fehlt eine Übersetzung, fällt fetchJson auf Deutsch zurück.
export const LANGS = [
  { code: "de", label: "Deutsch" },
  { code: "nl", label: "Nederlands (België)" },
  { code: "fr", label: "Français" },
  { code: "en-GB", label: "English (UK)" },
  { code: "en-US", label: "English (US)" },
  { code: "cs", label: "Čeština" },
];

const KEY = "trappist-karte-lang";

export function storedLang() {
  try {
    const l = localStorage.getItem(KEY);
    return LANGS.some((x) => x.code === l) ? l : null;
  } catch {
    return null;
  }
}

export const lang = storedLang() || "de";

export function setLang(code) {
  try {
    localStorage.setItem(KEY, code);
  } catch {
    /* Privatmodus: Auswahl gilt dann nur bis zum Neuladen nicht – akzeptiert */
  }
  location.reload();
}

export async function fetchJson(path) {
  if (lang !== "de") {
    const res = await fetch(path.replace(/^data\//, `data/${lang}/`));
    if (res.ok) return res.json();
  }
  return (await fetch(path)).json();
}

let ui = {};
export const t = (key, vars = {}) =>
  (ui[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ""));

// Lädt die UI-Texte und setzt alle [data-i18n] / [data-i18n-aria] im HTML.
export const uiReady = fetchJson("data/ui.json").then((data) => {
  ui = data;
  document.documentElement.lang = lang;
  document.title = t("title");
  document.querySelector('meta[name="description"]')?.setAttribute("content", t("subtitle"));
  document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => el.setAttribute("aria-label", t(el.dataset.i18nAria)));
});

// Sprachumschalter im Kopf + Startauswahl beim allerersten Besuch.
uiReady.then(() => {
  const select = document.getElementById("lang-select");
  select.innerHTML = LANGS.map((l) => `<option value="${l.code}"${l.code === lang ? " selected" : ""}>${l.label}</option>`).join("");
  select.addEventListener("change", () => setLang(select.value));

  if (!storedLang()) {
    const picker = document.getElementById("lang-picker");
    const list = picker.querySelector(".lang-picker__list");
    list.innerHTML = LANGS.map((l) => `<li><button type="button" data-lang="${l.code}">${l.label}</button></li>`).join("");
    list.addEventListener("click", (e) => {
      const code = e.target.dataset?.lang;
      if (code) setLang(code);
    });
    picker.hidden = false;
  }
});
