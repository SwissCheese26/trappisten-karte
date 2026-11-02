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

function breweryMarkerElement(closed) {
  const el = document.createElement("div");
  el.className = closed ? "brewery-marker brewery-marker--closed" : "brewery-marker";
  return el;
}

function popupHtml(p, closed) {
  const dates = closed
    ? `Abtei gegründet ${p.founded_abbey} &middot; Bier ${p.brewing_since}–${p.closed_since}`
    : `Abtei gegründet ${p.founded_abbey} &middot; Bier seit ${p.brewing_since}`;
  const badge = closed ? `<p class="popup-meta popup-meta--closed">Nicht mehr aktiv seit ${p.closed_since}</p>` : "";
  return `
    <h2>${p.name}</h2>
    <p class="popup-meta">${p.abbey} &middot; ${p.country}</p>
    ${badge}
    <p>${dates}</p>
    <p>${p.history}</p>
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

map.on("load", () => {
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

        const el = breweryMarkerElement(false);
        el.addEventListener("click", () => {
          map.getSource("connections").setData(connectionLines(feature, features));
        });

        new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).setPopup(popup).addTo(map);

        popup.on("close", () => {
          map.getSource("connections").setData({ type: "FeatureCollection", features: [] });
        });
      });

      // Geschlossene/ehemalige Trappisten-Brauereien: eigene dunkle Marker,
      // bewusst ohne Verbindungslinien (die zeigen nur Beziehungen zwischen
      // aktuell brauenden Abteien).
      closedFeatures.forEach((feature) => {
        const p = feature.properties;
        const [lng, lat] = feature.geometry.coordinates;
        const popup = new maplibregl.Popup({ offset: 18 }).setHTML(popupHtml(p, true));
        new maplibregl.Marker({ element: breweryMarkerElement(true) })
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
