import * as maplibregl from "https://unpkg.com/maplibre-gl@6.16.0/dist/maplibre-gl.mjs";

// Grundgerüst: eigene Vektorkarte (MapLibre GL + eigener Stil) initialisieren,
// GeoJSON laden, Marker mit Popup anzeigen.
//
// Kartenausschnitt bewusst auf Westeuropa + europäisches Russland begrenzt:
// das deckt sowohl die heutigen Abteien als auch die Fluchtroute der
// Trappisten während der Französischen Revolution ab (Exil bis nach
// Russland), ohne den Rest der Welt anzeigen zu müssen.
const EUROPE_BOUNDS = [
  [-15, 32], // Südwesten
  [65, 72], // Nordosten
];

const map = new maplibregl.Map({
  container: "map",
  style: "data/map-style.json",
  center: [10, 49],
  zoom: 4,
  maxBounds: EUROPE_BOUNDS,
  minZoom: 3,
});

map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");

function breweryMarkerElement() {
  const el = document.createElement("div");
  el.className = "brewery-marker";
  return el;
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

  fetch("data/breweries.geojson")
    .then((res) => res.json())
    .then((geojson) => {
      const features = geojson.features;

      features.forEach((feature) => {
        const p = feature.properties;
        const [lng, lat] = feature.geometry.coordinates;

        const popup = new maplibregl.Popup({ offset: 18 }).setHTML(`
          <h2>${p.name}</h2>
          <p class="popup-meta">${p.abbey} &middot; ${p.country}</p>
          <p>Abtei gegründet ${p.founded_abbey} &middot; Bier seit ${p.brewing_since}</p>
          <p>${p.history}</p>
        `);

        const el = breweryMarkerElement();
        el.addEventListener("click", () => {
          map.getSource("connections").setData(connectionLines(feature, features));
        });

        new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).setPopup(popup).addTo(map);

        popup.on("close", () => {
          map.getSource("connections").setData({ type: "FeatureCollection", features: [] });
        });
      });

      if (features.length > 0) {
        const b = bounds(features.map((f) => f.geometry.coordinates));
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
    .catch((err) => console.error("Konnte breweries.geojson nicht laden:", err));
});
