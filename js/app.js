import * as maplibregl from "https://unpkg.com/maplibre-gl@6.16.0/dist/maplibre-gl.mjs";

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
  el.setAttribute("aria-label", closed ? `${name} (nicht mehr aktiv)` : name);
  return el;
}

// Pilot: nur Westmalle hat bisher einen recherchierten Stationen-Zeitstrahl
// (siehe Issue #2 — pro Brauerei braucht das mehrere belegte Datums-Stationen,
// nicht nur Gründung/Braubeginn). Weitere Abteien folgen, sobald recherchiert.
const TIMELINE_BREWERIES = {
  Westmalle: "data/timelines/westmalle.json",
};

function popupHtml(p, closed) {
  const dates = closed
    ? `Abtei gegründet ${p.founded_abbey} &middot; Bier ${p.brewing_since}–${p.closed_since}`
    : `Abtei gegründet ${p.founded_abbey} &middot; Bier seit ${p.brewing_since}`;
  const badge = closed ? `<p class="popup-meta popup-meta--closed">Nicht mehr aktiv seit ${p.closed_since}</p>` : "";
  const playButton = TIMELINE_BREWERIES[p.name]
    ? `<button type="button" class="popup-play" data-timeline="${TIMELINE_BREWERIES[p.name]}">&#9654; Geschichte erfahren</button>`
    : "";
  return `
    <h2>${p.name}</h2>
    <p class="popup-meta">${p.abbey} &middot; ${p.country}</p>
    ${badge}
    <p>${dates}</p>
    <p>${p.history}</p>
    ${playButton}
  `;
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

// Verbindungslinien: Klick auf eine Brauerei zeichnet gerade "Wege" zu den
// anderen aktuell geladenen Brauereien. Das ist bewusst noch keine echte
// Routing-Berechnung (Straßen/Fußwege) — das kommt erst in Roadmap-Schritt 5
// über einen Routing-Dienst. Hier geht es nur darum, Beziehungen zwischen
// den Abteien sichtbar zu machen.
function connectionLines(fromFeature, allFeatures) {
  const [fromLng, fromLat] = fromFeature.geometry.coordinates;
  return {
    type: "FeatureCollection",
    features: allFeatures
      .filter((f) => f !== fromFeature)
      .map((f) => ({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [[fromLng, fromLat], f.geometry.coordinates],
        },
        properties: {},
      })),
  };
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
  fetch(url)
    .then((res) => res.json())
    .then((data) => {
      timelineStations = data.stations;
      timelineIndex = 0;
      viewBeforeTimeline = { center: map.getCenter(), zoom: map.getZoom() };
      timelineGlossary = [];
      closeGlossaryPopover();

      document.querySelectorAll(".maplibregl-popup").forEach((p) => p.remove());
      map.getSource("connections").setData({ type: "FeatureCollection", features: [] });

      if (data.glossary) {
        fetch(data.glossary)
          .then((res) => res.json())
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
        .map((s, i) => `<li class="timeline-axis__point" data-index="${i}"><span>${s.year}</span></li>`)
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
  timelinePanelText.innerHTML = highlightGlossaryTerms(s.text);
  timelinePrevBtn.disabled = timelineIndex === 0;
  timelineNextBtn.textContent = timelineIndex === timelineStations.length - 1 ? "Beenden" : "Weiter →";

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

  Promise.all([
    fetch("data/breweries.geojson").then((res) => res.json()),
    fetch("data/breweries-closed.json").then((res) => res.json()),
  ])
    .then(([activeGeojson, closedFeatures]) => {
      const features = activeGeojson.features;

      features.forEach((feature) => {
        const p = feature.properties;
        const [lng, lat] = feature.geometry.coordinates;

        const popup = new maplibregl.Popup({ offset: 18 }).setHTML(popupHtml(p, false));

        const el = breweryMarkerElement(p.name, false);
        el.addEventListener("click", () => {
          map.getSource("connections").setData(connectionLines(feature, features));
        });

        new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).setPopup(popup).addTo(map);

        popup.on("close", () => {
          map.getSource("connections").setData({ type: "FeatureCollection", features: [] });
        });

        popup.on("open", () => {
          const btn = popup.getElement().querySelector(".popup-play");
          if (btn) btn.addEventListener("click", () => openTimeline(btn.dataset.timeline));
        });
      });

      // Geschlossene/ehemalige Trappisten-Brauereien: eigene dunkle Marker,
      // bewusst ohne Verbindungslinien (die zeigen nur Beziehungen zwischen
      // aktuell brauenden Abteien).
      closedFeatures.forEach((feature) => {
        const p = feature.properties;
        const [lng, lat] = feature.geometry.coordinates;
        const popup = new maplibregl.Popup({ offset: 18 }).setHTML(popupHtml(p, true));
        new maplibregl.Marker({ element: breweryMarkerElement(p.name, true) })
          .setLngLat([lng, lat])
          .setPopup(popup)
          .addTo(map);
      });

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
    })
    .catch((err) => console.error("Konnte Brauerei-Daten nicht laden:", err));
});
