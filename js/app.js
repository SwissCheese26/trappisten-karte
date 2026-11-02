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

map.on("load", () => {
  fetch("data/breweries.geojson")
    .then((res) => res.json())
    .then((geojson) => {
      geojson.features.forEach((feature) => {
        const p = feature.properties;
        const [lng, lat] = feature.geometry.coordinates;

        const popup = new maplibregl.Popup({ offset: 18 }).setHTML(`
          <h2>${p.name}</h2>
          <p class="popup-meta">${p.abbey} &middot; ${p.country}</p>
          <p>Abtei gegründet ${p.founded_abbey} &middot; Bier seit ${p.brewing_since}</p>
          <p>${p.history}</p>
        `);

        new maplibregl.Marker({ element: breweryMarkerElement() })
          .setLngLat([lng, lat])
          .setPopup(popup)
          .addTo(map);
      });

      if (geojson.features.length > 0) {
        const b = bounds(geojson.features.map((f) => f.geometry.coordinates));
        map.fitBounds(b, { padding: 60, maxZoom: 8, duration: 0 });
      }
    })
    .catch((err) => console.error("Konnte breweries.geojson nicht laden:", err));
});
