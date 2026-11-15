import { fetchJson } from "./i18n.js";

// Bewusst nur eine Hürde, kein Schutz: Wer die Entwicklerwerkzeuge wirklich
// öffnen will, schafft das immer (Quelltext ist im Browser ohnehin lesbar).
// Wir sperren Kontextmenü und Tastenkürzel und zeigen ein Kreuz mit einem
// zufälligen Zitat, wenn ein angedocktes Werkzeugfenster erkannt wird.
const cross = document.getElementById("devtools-cross");
let quotes = [];

fetchJson("data/quotes.json").then((q) => (quotes = q)).catch(() => {});

function showCross() {
  if (!cross.hidden) return;
  const q = quotes[Math.floor(Math.random() * quotes.length)];
  if (q) {
    cross.querySelector(".devtools-cross__quote").innerHTML = `<em>${q.latin}</em><br>${q.text}`;
    cross.querySelector(".devtools-cross__source").textContent = q.source;
  }
  cross.hidden = false;
}

let holdUntil = 0;
const hideCross = () => {
  if (Date.now() >= holdUntil) cross.hidden = true;
};

document.addEventListener("contextmenu", (e) => e.preventDefault());
document.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  const mod = e.ctrlKey || e.metaKey;
  if (e.key === "F12" || (mod && e.shiftKey && ["i", "j", "c"].includes(k)) || (mod && !e.shiftKey && k === "u") || (e.metaKey && e.altKey && ["i", "j", "u"].includes(k))) {
    e.preventDefault();
    holdUntil = Date.now() + 4000;
    showCross();
    setTimeout(hideCross, 4100);
  }
});

// Angedocktes Werkzeugfenster verkleinert das Fenster innen gegenüber außen.
// Nur bei Maus-Geräten prüfen, auf Handys verschieben Adressleisten die Maße.
if (matchMedia("(pointer: fine)").matches) {
  setInterval(() => {
    const docked = window.outerWidth - window.innerWidth > 200 || window.outerHeight - window.innerHeight > 250;
    docked ? showCross() : hideCross();
  }, 1000);
}
