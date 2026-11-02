// Zwei Inhalte teilen sich das Overlay:
// - "Story" (data/book-content.json): 5-seitiges Einführungsbuch, öffnet sich
//   automatisch beim allerersten Besuch (localStorage-Flag), erzählt Ursprung
//   und Geschichte mit Seiten-Umblätter-Übergang.
// - "Regeln" (data/rules-content.json): über den Nav-Punkt "Schule" jederzeit
//   aufrufbar, eigenständiger Inhalt (keine Wiederholung der Story) — eine
//   scrollbare Liste der Trappisten-Regeln.
const SEEN_KEY = "trappist-karte-book-seen";

const overlay = document.getElementById("book-overlay");
const mapLink = document.querySelector('.site-nav__link[data-nav="map"]');
const schoolLink = document.querySelector('.site-nav__link[data-nav="school"]');
const topCross = document.querySelector(".top-cross");

let storyPages = [];
let storyIndex = 0;

// --- Inhaltswarnung: belastende Kapitel (Gewalt, Missbrauch) sind nicht
// zensiert, aber standardmäßig ausgeblendet. Export über window, damit
// app.js (eigenes Modul) beim Rendern der Zeitstrahl-Stationen filtern kann.
const SENSITIVE_KEY = "trappist-karte-show-sensitive";
const sensitiveToggle = document.getElementById("sensitive-toggle-input");
const contentWarning = document.getElementById("content-warning");

window.isSensitiveContentEnabled = () => localStorage.getItem(SENSITIVE_KEY) === "1";

sensitiveToggle.checked = window.isSensitiveContentEnabled();

sensitiveToggle.addEventListener("change", () => {
  if (sensitiveToggle.checked) {
    contentWarning.hidden = false;
    requestAnimationFrame(() => contentWarning.classList.add("is-open"));
  } else {
    localStorage.removeItem(SENSITIVE_KEY);
  }
});

function closeContentWarning() {
  contentWarning.classList.remove("is-open");
  window.setTimeout(() => {
    contentWarning.hidden = true;
  }, 200);
}

contentWarning.querySelector(".content-warning__confirm").addEventListener("click", () => {
  localStorage.setItem(SENSITIVE_KEY, "1");
  closeContentWarning();
});

contentWarning.querySelector(".content-warning__cancel").addEventListener("click", () => {
  sensitiveToggle.checked = false;
  closeContentWarning();
});

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
      <div class="book__controls book__controls--end">
        <button type="button" class="book__next">Quiz starten &rarr;</button>
      </div>
    </div>
  `;
  overlay.querySelector(".book__close").addEventListener("click", closeOverlay);
  overlay.querySelector(".book__controls .book__next").addEventListener("click", openQuiz);
  openOverlay();
}

// --- Quiz + Zertifikat ---------------------------------------------------
// Testet, was man aus Story/Regeln mitgenommen hat — keine neue Recherche
// nötig, alle Fragen stammen aus bereits belegten Inhalten. Bewusst kein
// Backend: Zertifikat wird clientseitig als PNG gezeichnet (Canvas) und
// direkt heruntergeladen, passend zum statischen Hosting-Ansatz.
const QUIZ_PASS_RATIO = 0.7;

let quizQuestions = [];
let quizIndex = 0;
let quizScore = 0;
let quizSelected = null;

function openQuiz() {
  fetch("data/quiz-content.json")
    .then((res) => res.json())
    .then((data) => {
      quizQuestions = data;
      quizIndex = 0;
      quizScore = 0;
      renderQuizShell();
      renderQuizQuestion();
      openOverlay();
    })
    .catch((err) => console.error("Konnte quiz-content.json nicht laden:", err));
}

function renderQuizShell() {
  overlay.innerHTML = `
    <div class="book book--quiz">
      <button type="button" class="book__close" aria-label="Schließen">&times;</button>
      <div class="book__text">
        <div class="book__progress quiz__progress"></div>
        <h2 class="book__heading quiz__question"></h2>
      </div>
      <ul class="quiz__options"></ul>
      <div class="book__controls">
        <div></div>
        <button type="button" class="book__next quiz__next" disabled>Weiter &rarr;</button>
      </div>
    </div>
  `;
  overlay.querySelector(".book__close").addEventListener("click", closeOverlay);
  overlay.querySelector(".quiz__next").addEventListener("click", () => {
    quizIndex += 1;
    if (quizIndex >= quizQuestions.length) {
      renderQuizResult();
    } else {
      renderQuizQuestion();
    }
  });
}

function renderQuizQuestion() {
  quizSelected = null;
  const q = quizQuestions[quizIndex];
  overlay.querySelector(".quiz__progress").textContent = `Frage ${quizIndex + 1} / ${quizQuestions.length}`;
  overlay.querySelector(".quiz__question").textContent = q.question;

  const list = overlay.querySelector(".quiz__options");
  list.innerHTML = q.options
    .map((opt, i) => `<li><button type="button" class="quiz__option" data-index="${i}">${opt}</button></li>`)
    .join("");

  overlay.querySelectorAll(".quiz__option").forEach((btn) => {
    btn.addEventListener("click", () => selectQuizOption(Number(btn.dataset.index)));
  });

  overlay.querySelector(".quiz__next").disabled = true;
  overlay.querySelector(".quiz__next").textContent =
    quizIndex === quizQuestions.length - 1 ? "Ergebnis ansehen →" : "Weiter →";
}

function selectQuizOption(index) {
  if (quizSelected !== null) return; // nur eine Antwort pro Frage
  quizSelected = index;
  const q = quizQuestions[quizIndex];
  if (index === q.correct) quizScore += 1;

  overlay.querySelectorAll(".quiz__option").forEach((btn) => {
    const i = Number(btn.dataset.index);
    btn.disabled = true;
    if (i === q.correct) btn.classList.add("is-correct");
    else if (i === index) btn.classList.add("is-wrong");
  });

  overlay.querySelector(".quiz__next").disabled = false;
}

function renderQuizResult() {
  const passed = quizScore / quizQuestions.length >= QUIZ_PASS_RATIO;
  overlay.innerHTML = `
    <div class="book book--quiz">
      <button type="button" class="book__close" aria-label="Schließen">&times;</button>
      <div class="book__text">
        <h2 class="book__heading">${quizScore} von ${quizQuestions.length} richtig</h2>
        <p class="rules-intro">${
          passed
            ? "Die Grundlagen sitzen. Lade dir zur Erinnerung ein Zertifikat herunter."
            : "Noch nicht ganz — ein Blick zurück in die Regeln oder die Geschichte lohnt sich."
        }</p>
      </div>
      ${
        passed
          ? `<div class="quiz__certificate-form">
               <label for="quiz-name">Name für das Zertifikat</label>
               <input type="text" id="quiz-name" placeholder="Dein Name" maxlength="60" />
               <button type="button" class="book__next quiz__download">Zertifikat herunterladen</button>
             </div>`
          : ""
      }
      <div class="book__controls">
        <button type="button" class="book__prev quiz__retry">&larr; Nochmal versuchen</button>
        <div></div>
        <button type="button" class="book__next quiz__to-map">Zur Karte →</button>
      </div>
    </div>
  `;
  overlay.querySelector(".book__close").addEventListener("click", closeOverlay);
  overlay.querySelector(".quiz__retry").addEventListener("click", openQuiz);
  overlay.querySelector(".quiz__to-map").addEventListener("click", closeOverlay);
  if (passed) {
    overlay.querySelector(".quiz__download").addEventListener("click", () => {
      const name = overlay.querySelector("#quiz-name").value.trim() || "Besucher der Trappisten-Karte";
      downloadCertificate(name, quizScore, quizQuestions.length);
    });
  }
}

async function downloadCertificate(name, score, total) {
  await document.fonts.load("700 54px Cinzel");
  await document.fonts.load("italic 400 28px 'Cormorant Garamond'");
  await document.fonts.load("400 28px 'Cormorant Garamond'");

  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 850;
  const ctx = canvas.getContext("2d");

  // Pergament-Grund + doppelte Rahmenlinie, passend zur Palette.
  ctx.fillStyle = "#e9e4d4";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#343a2e";
  ctx.lineWidth = 3;
  ctx.strokeRect(40, 40, canvas.width - 80, canvas.height - 80);
  ctx.strokeStyle = "#a9712b";
  ctx.lineWidth = 1;
  ctx.strokeRect(56, 56, canvas.width - 112, canvas.height - 112);

  // Kleines Kreuz oben mittig, wie im Seitenkopf.
  const cx = canvas.width / 2;
  ctx.fillStyle = "#1c1f1a";
  ctx.fillRect(cx - 5, 95, 10, 70);
  ctx.fillRect(cx - 22, 118, 44, 10);

  ctx.textAlign = "center";
  ctx.fillStyle = "#1c1f1a";
  ctx.font = "700 46px Cinzel";
  ctx.fillText("ZERTIFIKAT", cx, 250);

  ctx.font = "italic 400 26px 'Cormorant Garamond'";
  ctx.fillStyle = "#343a2e";
  ctx.fillText("hiermit wird bestätigt, dass", cx, 330);

  ctx.font = "700 40px Cinzel";
  ctx.fillStyle = "#1c1f1a";
  ctx.fillText(name, cx, 400);

  ctx.font = "400 28px 'Cormorant Garamond'";
  ctx.fillStyle = "#343a2e";
  wrapText(
    ctx,
    "sich mit der Geschichte, der Philosophie und den Regeln der Trappisten auseinandergesetzt hat.",
    cx,
    460,
    760,
    36
  );

  ctx.font = "400 24px 'Cormorant Garamond'";
  ctx.fillStyle = "#a9712b";
  ctx.fillText(`${score} von ${total} Fragen richtig beantwortet`, cx, 580);

  const today = new Date().toLocaleDateString("de-DE", { year: "numeric", month: "long", day: "numeric" });
  ctx.font = "italic 400 22px 'Cormorant Garamond'";
  ctx.fillStyle = "#343a2e";
  ctx.fillText(`Trappisten-Karte · ${today}`, cx, 760);

  canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "trappisten-karte-zertifikat.png";
    a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  let lineY = y;
  words.forEach((word) => {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, lineY);
      line = word;
      lineY += lineHeight;
    } else {
      line = test;
    }
  });
  if (line) ctx.fillText(line, x, lineY);
}

// --- Navigation --------------------------------------------------------

mapLink.addEventListener("click", closeOverlay);
topCross.addEventListener("click", closeOverlay);

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
