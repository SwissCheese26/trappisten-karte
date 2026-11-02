// Zwei Inhalte teilen sich das Overlay:
// - "Story" (data/book-content.json): 5-seitiges Einführungsbuch, öffnet sich
//   automatisch beim allerersten Besuch (localStorage-Flag), erzählt Ursprung
//   und Geschichte mit Seiten-Umblätter-Übergang.
// - "Regeln" (data/rules-content.json): über den Nav-Punkt "Schule" jederzeit
//   aufrufbar, eigenständiger Inhalt (keine Wiederholung der Story) — eine
//   scrollbare Liste der Trappisten-Regeln.
const SEEN_KEY = "trappist-karte-book-seen";

const overlay = document.getElementById("book-overlay");
const mapLink = document.querySelector('[data-nav="map"]');
const schoolLink = document.querySelector('[data-nav="school"]');

let storyPages = [];
let storyIndex = 0;

function closeOverlay() {
  overlay.classList.remove("is-open");
  window.setTimeout(() => {
    overlay.hidden = true;
    overlay.innerHTML = "";
  }, 250);
  mapLink.classList.add("is-active");
  schoolLink.classList.remove("is-active");
  localStorage.setItem(SEEN_KEY, "1");
}

function openOverlay() {
  overlay.hidden = false;
  requestAnimationFrame(() => overlay.classList.add("is-open"));
}

// Schließt bei Klick auf den Hintergrund (außerhalb der Karte/Liste) oder Escape.
overlay.addEventListener("click", (e) => {
  if (e.target === overlay) closeOverlay();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && overlay.classList.contains("is-open")) closeOverlay();
});

// --- Story (Einführungsbuch) ---------------------------------------------

function renderStoryShell() {
  overlay.innerHTML = `
    <div class="book">
      <button type="button" class="book__close" aria-label="Schließen">&times;</button>
      <figure class="book__page">
        <img class="book__image" alt="" />
        <figcaption class="book__credit"></figcaption>
      </figure>
      <div class="book__text">
        <h2 class="book__heading"></h2>
        <p class="book__body"></p>
      </div>
      <div class="book__controls">
        <button type="button" class="book__prev">&larr; Zurück</button>
        <div class="book__progress"></div>
        <button type="button" class="book__next">Weiter &rarr;</button>
      </div>
    </div>
  `;
  overlay.querySelector(".book__close").addEventListener("click", closeOverlay);
  overlay.querySelector(".book__prev").addEventListener("click", () => turnStory(-1));
  overlay.querySelector(".book__next").addEventListener("click", () => turnStory(1));
}

function renderStoryPage() {
  const p = storyPages[storyIndex];
  const img = overlay.querySelector(".book__image");
  img.src = p.image;
  img.alt = p.heading;
  overlay.querySelector(".book__credit").textContent = p.credit;
  overlay.querySelector(".book__heading").textContent = p.heading;
  overlay.querySelector(".book__body").textContent = p.text;
  overlay.querySelector(".book__progress").textContent = `${storyIndex + 1} / ${storyPages.length}`;

  overlay.querySelector(".book__prev").disabled = storyIndex === 0;
  overlay.querySelector(".book__next").textContent =
    storyIndex === storyPages.length - 1 ? "Zur Karte →" : "Weiter →";
}

function turnStory(direction) {
  const next = storyIndex + direction;
  if (next >= storyPages.length) {
    closeOverlay();
    return;
  }
  if (next < 0) return;

  const leaf = overlay.querySelector(".book");
  leaf.classList.add(direction > 0 ? "is-turning-next" : "is-turning-prev");
  window.setTimeout(() => {
    storyIndex = next;
    renderStoryPage();
    leaf.classList.remove("is-turning-next", "is-turning-prev");
  }, 220);
}

function openStory() {
  storyIndex = 0;
  renderStoryShell();
  renderStoryPage();
  openOverlay();
}

// --- Regeln ("Schule") -----------------------------------------------------

function openRules(data) {
  const items = data.rules
    .map(
      (r, i) => `
      <li class="rules-list__item">
        <span class="rules-list__number">${i + 1}</span>
        <div>
          <h3>${r.title}</h3>
          <p>${r.text}</p>
        </div>
      </li>`
    )
    .join("");

  overlay.innerHTML = `
    <div class="book book--rules">
      <button type="button" class="book__close" aria-label="Schließen">&times;</button>
      <div class="book__text">
        <h2 class="book__heading">${data.heading}</h2>
        <p class="rules-intro">${data.intro}</p>
      </div>
      <ol class="rules-list">${items}</ol>
    </div>
  `;
  overlay.querySelector(".book__close").addEventListener("click", closeOverlay);
  openOverlay();
}

// --- Navigation --------------------------------------------------------

mapLink.addEventListener("click", closeOverlay);

schoolLink.addEventListener("click", () => {
  mapLink.classList.remove("is-active");
  schoolLink.classList.add("is-active");
  fetch("data/rules-content.json")
    .then((res) => res.json())
    .then(openRules)
    .catch((err) => console.error("Konnte rules-content.json nicht laden:", err));
});

fetch("data/book-content.json")
  .then((res) => res.json())
  .then((data) => {
    storyPages = data;
    if (!localStorage.getItem(SEEN_KEY)) {
      schoolLink.classList.remove("is-active");
      mapLink.classList.remove("is-active");
      openStory();
    }
  })
  .catch((err) => console.error("Konnte book-content.json nicht laden:", err));
