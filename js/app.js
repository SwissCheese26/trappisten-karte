// Grundgerüst: Karte initialisieren, GeoJSON laden, Marker mit Popup anzeigen.
// Kartenausschnitt grob auf Belgien/Niederlande zentriert (aktueller Testdatensatz).
const map = L.map("map").setView([50.6, 4.8], 7);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende',
  maxZoom: 18,
}).addTo(map);

fetch("data/breweries.geojson")
  .then((res) => res.json())
  .then((geojson) => {
    const layer = L.geoJSON(geojson, {
      onEachFeature: (feature, layer) => {
        const p = feature.properties;
        layer.bindPopup(
          `
          <h2>${p.name}</h2>
          <p class="popup-meta">${p.abbey} &middot; ${p.country}</p>
          <p>Abtei gegründet ${p.founded_abbey} &middot; Bier seit ${p.brewing_since}</p>
          <p>${p.history}</p>
        `,
          // Platz oben links reservieren, damit Popups nicht hinter der
          // Header-Karte verschwinden (die liegt dort als DOM-Overlay).
          { autoPanPaddingTopLeft: L.point(360, 140), autoPanPaddingBottomRight: L.point(20, 20) }
        );
      },
    }).addTo(map);

    map.fitBounds(layer.getBounds(), { padding: [40, 40] });
  })
  .catch((err) => console.error("Konnte breweries.geojson nicht laden:", err));
