// "Schule": ein kleines Buch mit Einführung in Geschichte und Philosophie der
// Trappisten, bevor man die Karte sieht. Blättert beim Klick auf "Weiter" wie
// eine Buchseite um (CSS-Transition, kein Framework). Beim ersten Besuch
// öffnet es sich automatisch; über den Nav-Punkt "Schule" ist es jederzeit
// wieder aufrufbar.
const SEEN_KEY = "trappist-karte-book-seen";

const overlay = document.getElementById("book-overlay");
const mapLink = document.querySelector('[data-nav="map"]');
const schoolLink = document.querySelector('[data-nav="school"]');

let pages = [];
let current = 0;

function renderShell() {
  overlay.innerHTML = `
    <div class="book">
      <button type="button" class="book__close" aria-label="Buch schließen">&times;</button>
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

  overlay.querySelector(".book__close").addEventListener("click", closeBook);
  overlay.querySelector(".book__prev").addEventListener("click", () => turn(-1));
  overlay.querySelector(".book__next").addEventListener("click", () => turn(1));
}

function renderPage() {
  const p = pages[current];
  const img = overlay.querySelector(".book__image");
  img.src = p.image;
  img.alt = p.heading;
  overlay.querySelector(".book__credit").textContent = p.credit;
  overlay.querySelector(".book__heading").textContent = p.heading;
  overlay.querySelector(".book__body").textContent = p.text;
  overlay.querySelector(".book__progress").textContent = `${current + 1} / ${pages.length}`;

  const prevBtn = overlay.querySelector(".book__prev");
  const nextBtn = overlay.querySelector(".book__next");
  prevBtn.disabled = current === 0;
  nextBtn.textContent = current === pages.length - 1 ? "Zur Karte →" : "Weiter →";
}

function turn(direction) {
  const next = current + direction;
  if (next >= pages.length) {
    closeBook();
    return;
  }
  if (next < 0) return;

  const leaf = overlay.querySelector(".book");
  leaf.classList.add(direction > 0 ? "is-turning-next" : "is-turning-prev");
  window.setTimeout(() => {
    current = next;
    renderPage();
    leaf.classList.remove("is-turning-next", "is-turning-prev");
  }, 220);
}

function openBook() {
  overlay.hidden = false;
  requestAnimationFrame(() => overlay.classList.add("is-open"));
  mapLink.classList.remove("is-active");
  schoolLink.classList.add("is-active");
}

function closeBook() {
  overlay.classList.remove("is-open");
  window.setTimeout(() => {
    overlay.hidden = true;
  }, 250);
  mapLink.classList.add("is-active");
  schoolLink.classList.remove("is-active");
  localStorage.setItem(SEEN_KEY, "1");
}

mapLink.addEventListener("click", closeBook);
schoolLink.addEventListener("click", () => {
  current = 0;
  renderPage();
  openBook();
});

fetch("data/book-content.json")
  .then((res) => res.json())
  .then((data) => {
    pages = data;
    renderShell();
    renderPage();
    if (!localStorage.getItem(SEEN_KEY)) {
      openBook();
    }
  })
  .catch((err) => console.error("Konnte book-content.json nicht laden:", err));
