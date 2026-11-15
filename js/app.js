import * as maplibregl from "https://unpkg.com/maplibre-gl@6.16.0/dist/maplibre-gl.mjs";
import { fetchJson, t, uiReady } from "./i18n.js";

// Grundgerüst: eigene Vektorkarte (MapLibre GL + eigener Stil) initialisieren,
// GeoJSON laden, Marker mit Popup anzeigen.
//
// Kein hartes maxBounds mehr: fitBounds() unten zoomt beim Laden automatisch
// auf Europa + Neuengland (USA), das reicht als Standardausschnitt. Ein
// festes maxBounds kollidierte auf schmalen/Hochformat-Bildschirmen
// unzuverlässig mit fitBounds (Punkte am Rand, z. B. Spencer/USA, fielen
// aus dem sichtbaren Bereich — per Playwright-Mobile-Test gefunden).
// Freies Scrollen ist ein kleines Zugeständnis gegenüber "kein Asien
// zeigen"; die Standardansicht bleibt davon unberührt.
const map = new maplibregl.Map({
  container: "map",
  style: "data/map-style.json",
  center: [10, 49],
  zoom: 4,
  minZoom: 0.5,
});

map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

function breweryMarkerElement(name, closed) {
  const el = document.createElement("div");
  el.className = closed ? "brewery-marker brewery-marker--closed" : "brewery-marker";
  el.setAttribute("role", "button");
  el.setAttribute("tabindex", "0");
  el.setAttribute("aria-label", closed ? t("marker_closed", { name }) : name);
  return el;
}

// Siehe Issue #2 — jede Brauerei braucht mehrere belegte Datums-Stationen,
// nicht nur Gründung/Braubeginn, deshalb nach und nach recherchiert statt
// pauschal für alle. Bisher: alle aktuellen belgischen Abteien + Achel.
const TIMELINE_BREWERIES = {
  Westmalle: "data/timelines/westmalle.json",
  Chimay: "data/timelines/chimay.json",
  Orval: "data/timelines/orval.json",
  Rochefort: "data/timelines/rochefort.json",
  Westvleteren: "data/timelines/westvleteren.json",
  Achel: "data/timelines/achel.json",
  "Mont des Cats": "data/timelines/mont-des-cats.json",
  Engelszell: "data/timelines/engelszell.json",
  "La Trappe": "data/timelines/la-trappe.json",
  "Tre Fontane": "data/timelines/tre-fontane.json",
  Cardeña: "data/timelines/cardena.json",
  "Mount Saint Bernard": "data/timelines/mount-saint-bernard.json",
  Spencer: "data/timelines/spencer.json",
  Zundert: "data/timelines/zundert.json",
};

// Issue #6: lange Abtei-Texte in kurze Seiten (je ca. 5-6 Zeilen) zum Umblättern.
function chunkText(text, max = 230) {
  const out = [];
  let cur = "";
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    if (cur && `${cur} ${sentence}`.length > max) {
      out.push(cur);
      cur = sentence;
    } else {
      cur = cur ? `${cur} ${sentence}` : sentence;
    }
  }
  if (cur) out.push(cur);
  return out;
}

function popupHtml(p, closed) {
  const dates = closed
    ? `${t("popup_founded", { year: p.founded_abbey })} &middot; ${t("popup_brewing_range", { from: p.brewing_since, to: p.closed_since })}`
    : `${t("popup_founded", { year: p.founded_abbey })} &middot; ${t("popup_brewing_since", { year: p.brewing_since })}`;
  const badge = closed ? `<p class="popup-meta popup-meta--closed">${t("popup_closed", { year: p.closed_since })}</p>` : "";
  const playButton = TIMELINE_BREWERIES[p.name]
    ? `<button type="button" class="popup-play" data-timeline="${TIMELINE_BREWERIES[p.name]}">${t("popup_play")}</button>`
    : "";
  const pages = chunkText(p.history);
  if (p.beers && p.beers.length) {
    const items = p.beers.map((b) => `<li>${b.name} &middot; ${b.style}${b.abv != null ? ` &middot; ${b.abv}&nbsp;%` : ""}</li>`).join("");
    pages.push(`<strong>${t("popup_beers")}</strong><ul class="popup-beers">${items}</ul>`);
  }
  if (p.visit) pages.push(`<strong>${t("popup_visit")}</strong><br>${p.visit}`);
  const pager =
    pages.length > 1
      ? `<div class="popup-page__nav">
           <button type="button" class="popup-page__prev" aria-label="${t("page_prev")}" disabled>&larr;</button>
           <span class="popup-page__count">${t("page_of", { n: 1, total: pages.length })}</span>
           <button type="button" class="popup-page__next" aria-label="${t("page_next")}">&rarr;</button>
         </div>`
      : "";
  return `
    <h2>${p.name}</h2>
    <p class="popup-meta">${p.abbey} &middot; ${p.country}</p>
    ${badge}
    <p>${dates}</p>
    ${pages.map((h, i) => `<div class="popup-page" data-page="${i}"${i ? " hidden" : ""}>${h.startsWith("<") ? h : `<p>${h}</p>`}</div>`).join("")}
    ${pager}
    ${playButton}
  `;
}

// Blättern innerhalb eines geöffneten Popups.
function wirePager(popup) {
  const root = popup.getElement();
  const pages = [...root.querySelectorAll(".popup-page")];
  const prev = root.querySelector(".popup-page__prev");
  const next = root.querySelector(".popup-page__next");
  if (!prev) return;
  let i = 0;
  const show = (n) => {
    i = n;
    pages.forEach((el, k) => (el.hidden = k !== i));
    root.querySelector(".popup-page__count").textContent = t("page_of", { n: i + 1, total: pages.length });
    prev.disabled = i === 0;
    next.disabled = i === pages.length - 1;
  };
  prev.addEventListener("click", () => show(i - 1));
  next.addEventListener("click", () => show(i + 1));
}

function bounds(coordsList) {
  return coordsList.reduce(
    (b, [lng, lat]) => [
      [Math.min(b[0][0], lng), Math.min(b[0][1], lat)],
      [Math.max(b[1][0], lng), Math.max(b[1][1], lat)],
    ],
    [
      [Infinity, Infinity],
      [-Infinity, -Infinity],
    ]
  );
}

// --- Zeitstrahl-Modus: "Geschichte erfahren" -----------------------------
// Statt die Karte mit einem Overlay zu verdecken, bleibt sie sichtbar und
// "spielt" die Stationen als Kamerafahrt ab (flyTo), während oben ein
// Zahlenstrahl den Fortschritt zeigt und unten der Text erzählt wird — wie
// ein interaktiver Film statt eines weiteren Lese-Buchs.
const timelineMode = document.getElementById("timeline-mode");
const timelineAxisLine = timelineMode.querySelector(".timeline-axis__line");
const timelineAxisPoints = timelineMode.querySelector(".timeline-axis__points");
const timelinePanelYear = timelineMode.querySelector(".timeline-panel__year");
const timelinePanelTitle = timelineMode.querySelector(".timeline-panel__title");
const timelinePanelText = timelineMode.querySelector(".timeline-panel__text");
const timelinePanelWarning = timelineMode.querySelector(".timeline-panel__warning");
const timelinePrevBtn = timelineMode.querySelector(".timeline-panel__prev");
const timelineNextBtn = timelineMode.querySelector(".timeline-panel__next");
const timelineCloseBtn = timelineMode.querySelector(".timeline-mode__close");

const glossaryPopover = document.getElementById("glossary-popover");
const glossaryImage = glossaryPopover.querySelector(".glossary-popover__image");
const glossaryCredit = glossaryPopover.querySelector(".glossary-popover__credit");
const glossaryTerm = glossaryPopover.querySelector(".glossary-popover__term");
const glossaryDescription = glossaryPopover.querySelector(".glossary-popover__description");

function openGlossaryPopover(entry, anchorEl) {
  glossaryTerm.textContent = entry.term;
  glossaryDescription.textContent = entry.description;
  if (entry.image) {
    glossaryImage.src = entry.image;
    glossaryImage.alt = entry.term;
    glossaryImage.hidden = false;
    glossaryCredit.textContent = entry.credit || "";
  } else {
    glossaryImage.hidden = true;
    glossaryCredit.textContent = "";
  }

  glossaryPopover.hidden = false;
  const box = anchorEl.getBoundingClientRect();
  const popoverWidth = 280;
  let left = box.left + box.width / 2 - popoverWidth / 2;
  left = Math.max(12, Math.min(left, window.innerWidth - popoverWidth - 12));
  let top = box.top - 12;
  // Unter statt über dem Begriff zeigen, wenn oben nicht genug Platz ist.
  const showBelow = top < 220;
  glossaryPopover.style.left = `${left}px`;
  glossaryPopover.style.top = showBelow ? `${box.bottom + 12}px` : "";
  glossaryPopover.style.bottom = showBelow ? "" : `${window.innerHeight - box.top + 12}px`;
  requestAnimationFrame(() => glossaryPopover.classList.add("is-open"));
}

function closeGlossaryPopover() {
  glossaryPopover.classList.remove("is-open");
  window.setTimeout(() => {
    glossaryPopover.hidden = true;
  }, 150);
}

glossaryPopover.querySelector(".glossary-popover__close").addEventListener("click", closeGlossaryPopover);
document.addEventListener("click", (e) => {
  if (e.target.classList.contains("glossary-term")) {
    const entry = timelineGlossary.find((g) => g.id === e.target.dataset.termId);
    if (entry) openGlossaryPopover(entry, e.target);
  } else if (!glossaryPopover.contains(e.target)) {
    closeGlossaryPopover();
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeGlossaryPopover();
});

let timelineStations = [];
let timelineIndex = 0;
let viewBeforeTimeline = null;
let timelineGlossary = [];

// Glossar: weniger bekannte Namen/Begriffe im Erzähltext anklickbar machen.
// Längere Begriffe zuerst ersetzen, sonst würde z. B. "Rancé" in einem
// bereits ersetzten "Armand de Rancé"-Treffer nochmal anschlagen.
function highlightGlossaryTerms(text) {
  let html = text;
  const sorted = [...timelineGlossary].sort((a, b) => b.term.length - a.term.length);
  sorted.forEach((entry) => {
    html = html.split(entry.term).join(
      `<button type="button" class="glossary-term" data-term-id="${entry.id}">${entry.term}</button>`
    );
  });
  return html;
}

function openTimeline(url) {
  fetchJson(url)
    .then((data) => {
      const sensitiveEnabled = window.isSensitiveContentEnabled && window.isSensitiveContentEnabled();
      timelineStations = data.stations.filter((s) => !s.sensitive || sensitiveEnabled);
      const hiddenCount = data.stations.length - timelineStations.length;
      const hiddenNote = timelineMode.querySelector(".timeline-axis__hidden-note");
      hiddenNote.hidden = hiddenCount === 0;
      hiddenNote.textContent = hiddenCount === 1 ? t("hidden_one") : t("hidden_many", { n: hiddenCount });
      timelineIndex = 0;
      viewBeforeTimeline = { center: map.getCenter(), zoom: map.getZoom() };
      timelineGlossary = [];
      closeGlossaryPopover();

      document.querySelectorAll(".maplibregl-popup").forEach((p) => p.remove());
      map.getSource("connections").setData({ type: "FeatureCollection", features: [] });

      if (data.glossary) {
        fetchJson(data.glossary)
          .then((glossary) => {
            timelineGlossary = glossary;
            renderStation(); // Begriffe im bereits sichtbaren Text nachträglich markieren
          })
          .catch((err) => console.error("Konnte Glossar nicht laden:", err));
      }

      map.getSource("timeline-route").setData({
        type: "Feature",
        geometry: { type: "LineString", coordinates: timelineStations.map((s) => s.coordinates) },
        properties: {},
      });

      timelineAxisPoints.innerHTML = timelineStations
        .map(
          (s, i) =>
            `<li class="timeline-axis__point${s.sensitive ? " is-sensitive" : ""}" data-index="${i}"><span>${s.year}</span></li>`
        )
        .join("");
      timelineAxisPoints.querySelectorAll(".timeline-axis__point").forEach((el) => {
        el.addEventListener("click", () => goToStation(Number(el.dataset.index)));
      });

      const headerBox = document.querySelector(".site-header").getBoundingClientRect();
      timelineMode.querySelector(".timeline-axis").style.top = `${headerBox.bottom + 16}px`;

      timelineMode.hidden = false;
      requestAnimationFrame(() => timelineMode.classList.add("is-open"));
      renderStation();
    })
    .catch((err) => console.error("Konnte Zeitstrahl nicht laden:", err));
}

function renderStation() {
  const s = timelineStations[timelineIndex];
  timelinePanelYear.textContent = s.year;
  timelinePanelTitle.textContent = s.title;
  timelinePanelWarning.hidden = !s.sensitive;
  timelinePanelWarning.textContent = s.sensitive ? t("trigger_prefix", { text: s.trigger_warning || t("trigger_default") }) : "";
  timelinePanelText.innerHTML = highlightGlossaryTerms(s.text);
  timelinePrevBtn.disabled = timelineIndex === 0;
  timelineNextBtn.textContent = timelineIndex === timelineStations.length - 1 ? t("finish") : t("next");

  timelineAxisPoints.querySelectorAll(".timeline-axis__point").forEach((el, i) => {
    el.classList.toggle("is-active", i === timelineIndex);
    el.classList.toggle("is-visited", i <= timelineIndex);
  });

  map.flyTo({ center: s.coordinates, zoom: s.zoom, duration: 1400, essential: true });
}

function goToStation(index) {
  if (index < 0 || index >= timelineStations.length) return;
  timelineIndex = index;
  renderStation();
}

function closeTimeline() {
  timelineMode.classList.remove("is-open");
  window.setTimeout(() => {
    timelineMode.hidden = true;
  }, 250);
  map.getSource("timeline-route").setData({
    type: "Feature",
    geometry: { type: "LineString", coordinates: [] },
    properties: {},
  });
  if (viewBeforeTimeline) {
    map.flyTo({ center: viewBeforeTimeline.center, zoom: viewBeforeTimeline.zoom, duration: 1200 });
  }
}

timelinePrevBtn.addEventListener("click", () => goToStation(timelineIndex - 1));
timelineNextBtn.addEventListener("click", () => {
  if (timelineIndex === timelineStations.length - 1) {
    closeTimeline();
  } else {
    goToStation(timelineIndex + 1);
  }
});
timelineCloseBtn.addEventListener("click", closeTimeline);

map.on("load", () => {
  map.addSource("timeline-route", {
    type: "geojson",
    data: { type: "Feature", geometry: { type: "LineString", coordinates: [] }, properties: {} },
  });
  map.addLayer({
    id: "timeline-route",
    type: "line",
    source: "timeline-route",
    paint: {
      "line-color": "#1c1f1a",
      "line-width": 2,
      "line-dasharray": [1, 1.5],
      "line-opacity": 0.6,
    },
  });

  map.addSource("connections", {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  map.addLayer({
    id: "connections",
    type: "line",
    source: "connections",
    paint: {
      "line-color": "#a9712b",
      "line-width": 1.5,
      "line-dasharray": [2, 2],
      "line-opacity": 0.75,
    },
  });

  uiReady.then(() => Promise.all([fetchJson("data/breweries.geojson"), fetchJson("data/breweries-closed.json")]))
    .then(([activeGeojson, closedFeatures]) => {
      const features = activeGeojson.features;
      const entries = [];

      // Issue #3: Marker, die sich auf dem Bildschirm überlappen, werden zu
      // einer Zahl zusammengefasst (Pixel-Abstand, neu berechnet beim Zoomen).
      const CLUSTER_PX = 28;
      let clusterMarkers = [];
      function recluster() {
        clusterMarkers.forEach((m) => m.remove());
        clusterMarkers = [];
        const pts = entries.map((e) => ({ e, p: map.project(e.lngLat) }));
        const used = new Set();
        pts.forEach((a, i) => {
          if (used.has(i)) return;
          used.add(i);
          const group = [a];
          pts.forEach((b, j) => {
            if (!used.has(j) && Math.hypot(a.p.x - b.p.x, a.p.y - b.p.y) < CLUSTER_PX) {
              used.add(j);
              group.push(b);
            }
          });
          group.forEach((g) => (g.e.el.style.display = group.length > 1 ? "none" : ""));
          if (group.length < 2) return;
          const el = document.createElement("button");
          el.type = "button";
          el.className = "brewery-cluster";
          el.textContent = group.length;
          el.setAttribute("aria-label", t("cluster_aria", { n: group.length }));
          const lngs = group.map((g) => g.e.lngLat[0]);
          const lats = group.map((g) => g.e.lngLat[1]);
          const box = [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]];
          el.addEventListener("click", () => map.fitBounds(box, { padding: 90, maxZoom: 13, duration: 700 }));
          clusterMarkers.push(
            new maplibregl.Marker({ element: el }).setLngLat([(box[0][0] + box[1][0]) / 2, (box[0][1] + box[1][1]) / 2]).addTo(map)
          );
        });
      }
      map.on("zoomend", recluster);

      const clearRoute = () => map.getSource("connections").setData({ type: "FeatureCollection", features: [] });

      // Issues #4/#5: nur die angeklickte Abtei bekommt ihre eigene Route
      // (Stationen ihres Zeitstrahls); alle anderen Pins werden ausgeblendet.
      function addBrewery(feature, closed) {
        const p = feature.properties;
        const [lng, lat] = feature.geometry.coordinates;
        const el = breweryMarkerElement(p.name, closed);
        const popup = new maplibregl.Popup({ offset: 18 }).setHTML(popupHtml(p, closed));
        new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).setPopup(popup).addTo(map);
        entries.push({ el, lngLat: [lng, lat] });

        popup.on("open", () => {
          document.body.classList.add("has-selection");
          el.classList.add("is-selected");
          wirePager(popup);
          const btn = popup.getElement().querySelector(".popup-play");
          if (btn) btn.addEventListener("click", () => openTimeline(btn.dataset.timeline));
          const url = TIMELINE_BREWERIES[p.name];
          if (url) {
            fetchJson(url)
              .then((d) =>
                map.getSource("connections").setData({
                  type: "Feature",
                  geometry: { type: "LineString", coordinates: d.stations.filter((st) => !st.sensitive).map((st) => st.coordinates) },
                  properties: {},
                })
              )
              .catch(() => {});
          }
        });
        popup.on("close", () => {
          document.body.classList.remove("has-selection");
          el.classList.remove("is-selected");
          clearRoute();
        });
      }

      features.forEach((f) => addBrewery(f, false));
      closedFeatures.forEach((f) => addBrewery(f, true));

      const allCoords = features.concat(closedFeatures).map((f) => f.geometry.coordinates);
      if (allCoords.length > 0) {
        const b = bounds(allCoords);
        // Header-Karte liegt als DOM-Overlay über der Karte und ist je nach
        // Bildschirmgröße unterschiedlich hoch — oben entsprechend mehr Platz
        // lassen, sonst verschwinden Marker ganz oben links darunter
        // (gefunden per Playwright-Mobile-Test).
        const headerBox = document.querySelector(".site-header").getBoundingClientRect();
        map.fitBounds(b, {
          padding: { top: headerBox.bottom + 20, bottom: 40, left: 30, right: 30 },
          maxZoom: 8,
          duration: 0,
        });
      }
      recluster();
    })
    .catch((err) => console.error("Konnte Brauerei-Daten nicht laden:", err));
});
