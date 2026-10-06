(() => {
  const units = window.CKLA_DATA;
  const storageKey = "sound-garden-v1";
  const state = { unit: 0, screen: "home", mode: "words", rounds: [], round: 0, typed: "", errors: 0, streak: 0, shift: false, stars: 0, stats: {} };
  const $ = (id) => document.getElementById(id);
  let saved = readSaved();

  function readSaved() {
    try { return JSON.parse(localStorage.getItem(storageKey)) || { lists: {}, stats: {} }; }
    catch { return { lists: {}, stats: {} }; }
  }
  function persist() { localStorage.setItem(storageKey, JSON.stringify(saved)); }
  function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  function cumulative(property) { return [...new Set(units.slice(0, state.unit + 1).flatMap((unit) => unit[property] || []))]; }
  function customWords() { return saved.lists[state.unit] || []; }
  function listLabel() { return `Unit ${state.unit + 1} · ${units[state.unit].title}`; }
  function renderHome() {
    $("unitPicker").innerHTML = units.map((unit, i) => `<button role="tab" aria-selected="${i === state.unit}" class="unit-tab ${i === state.unit ? "active" : ""}" data-unit="${i}" type="button"><span>${i + 1}</span><small>Unit ${i + 1}</small></button>`).join("");
    const u = units[state.unit];
    const stars = saved.stats[state.unit]?.stars || 0;
    $("unitCard").innerHTML = `<div class="unit-card-main"><div class="unit-kicker"><span class="mini-leaf">✿</span> UNIT ${state.unit + 1}</div><h3>${escapeHtml(u.title)}</h3><p class="unit-focus">${escapeHtml(u.focus)}</p><p class="unit-summary">${escapeHtml(u.summary)}</p><div class="unit-meta"><span>✿ ${u.skills.length} skill families</span><span>✨ ${cumulative("tricky").length} tricky words</span></div></div><div class="unit-card-side"><div class="progress-ring"><strong>${Math.min(stars, 99)}</strong><small>stars</small></div><span>growing every day</span></div>`;
    $("unitPicker").querySelectorAll("[data-unit]").forEach((button) => button.addEventListener("click", () => { state.unit = Number(button.dataset.unit); renderHome(); }));
    $("startWords").disabled = !(u.words.length + cumulative("tricky").length);
    $("startWeekly").classList.toggle("is-empty", !customWords().length);
    $("startWeekly").querySelector("small").textContent = customWords().length ? `${customWords().length} grown-up words · ready to practice.` : "Your grown-up can add this week’s words.";
  }
  function renderPatterns() {
    const skills = [...new Set(units.slice(0, state.unit + 1).flatMap((unit) => unit.skills))];
    $("patternsList").innerHTML = skills.map((skill, i) => `<span><i>${i < skills.length - units[state.unit].skills.length ? "✓" : "✿"}</i>${escapeHtml(skill)}</span>`).join("");
    $("parentUnitNumber").textContent = state.unit + 1;
    $("parentUnitTitle").textContent = units[state.unit].title;
    $("customWords").value = (saved.lists[state.unit] || []).map((item) => item.hint ? `${item.word}, ${item.hint}` : item.word).join("\n");
  }
  function showParent() {
    state.screen = "parent";
    $("homeView").hidden = true; $("gameView").hidden = true; $("parentView").hidden = false;
    renderPatterns(); $("savedNote").textContent = "";
    window.scrollTo(0, 0);
  }
  function closeParent() { state.screen = "home"; $("parentView").hidden = true; $("homeView").hidden = false; renderHome(); window.scrollTo(0, 0); }
  function parseList(text) {
    return text.split(/[\n;]+/).map((line) => line.trim()).filter(Boolean).map((line) => {
      const [word, ...rest] = line.split(",");
      return { word: word.trim(), hint: rest.join(",").trim() };
    }).filter((item) => /^[a-zA-Z][a-zA-Z'-]*$/.test(item.word));
  }
  function speak(text) {
    if (!("speechSynthesis" in window)) { $("gameFeedback").textContent = "Audio isn’t available on this device yet. Ask a grown-up to check sound settings."; return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US"; utterance.rate = state.mode === "sentences" ? 0.78 : 0.8; utterance.pitch = 1.04;
    window.speechSynthesis.speak(utterance);
  }
  function startGame(mode) {
    state.mode = mode; state.round = 0; state.errors = 0; state.streak = 0; state.typed = ""; state.shift = false;
    state.stars = saved.stats[state.unit]?.stars || 0;
    const wordItems = units[state.unit].words.map((word) => ({ word }));
    const banks = {
      words: wordItems,
      tricky: cumulative("tricky").map((word) => ({ word })),
      weekly: customWords(),
      sentences: units.slice(0, state.unit + 1).flatMap((unit) => unit.sentences.map((word) => ({ word })))
    };
    if (!banks[mode]?.length) {
      if (mode === "weekly") { showParent(); $("savedNote").textContent = "Add this week’s list first, then come back to play."; }
      return;
    }
    state.rounds = shuffle([...banks[mode]]).slice(0, Math.min(10, banks[mode].length));
    state.screen = "game"; $("homeView").hidden = true; $("parentView").hidden = true; $("gameView").hidden = false;
    $("gameModeLabel").textContent = ({ words:"Word garden", tricky:"Tricky word trail", weekly:"My spelling list", sentences:"Sentence meadow" })[mode];
    $("listenHint").textContent = mode === "sentences" ? "Listen to the whole sentence. Replay it as often as you like." : "Listen carefully. You can replay it anytime.";
    $("celebrate").hidden = true; drawKeyboard(); showRound(true); window.scrollTo(0, 0);
  }
  function shuffle(items) { for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; } return items; }
  function activeItem() { return state.rounds[state.round]; }
  function showRound(announce) {
    const item = activeItem(); if (!item) return finishGame();
    state.typed = ""; state.errors = 0;
    $("progressLabel").textContent = `${state.round + 1} of ${state.rounds.length}`;
    $("progressFill").style.width = `${((state.round + 1) / state.rounds.length) * 100}%`;
    $("streakPill").textContent = `✦ ${state.streak}`;
    $("gameFeedback").textContent = state.mode === "sentences" ? "Tap the letters, spaces, and punctuation you hear." : "Tap the letters to spell the word.";
    $("gameFeedback").className = "game-feedback";
    $("celebrate").hidden = true; $("checkAnswer").disabled = false;
    drawAnswer();
    if (announce) { setTimeout(() => speak(item.word), 180); }
  }
  function drawAnswer() {
    const value = state.typed;
    const capacity = state.mode === "sentences" ? Math.max(activeItem()?.word.length || 0, value.length + 2) : Math.max(activeItem()?.word.length || 0, value.length + 1);
    $("answerArea").innerHTML = Array.from({ length: Math.min(capacity, state.mode === "sentences" ? 54 : 24) }, (_, i) => {
      const character = value[i];
      return `<span class="answer-tile ${character ? "filled" : ""}">${character === " " ? " " : escapeHtml(character || "")}</span>`;
    }).join("");
    $("answerArea").classList.toggle("sentence-answer", state.mode === "sentences");
  }
  function drawKeyboard() {
    const rows = ["qwertyuiop", "asdfghjkl", "⇧zxcvbnm⌫"];
    $("keyboard").innerHTML = rows.map((row) => `<div class="key-row">${[...row].map((letter) => {
      const special = letter === "⇧" || letter === "⌫";
      return `<button type="button" class="key ${special ? "key-special" : ""} ${letter === "⌫" ? "key-delete" : ""}" data-key="${letter}" aria-label="${letter === "⌫" ? "Delete last letter" : letter === "⇧" ? "Use a capital letter" : letter}">${special ? letter : (state.shift ? letter.toUpperCase() : letter)}</button>`;
    }).join("")}</div>`).join("") + (state.mode === "sentences" ? `<div class="key-row key-bottom"><button class="key key-special space-key" data-key=" " type="button">space</button><button class="key key-special punctuation-key" data-key="." type="button">.</button><button class="key key-special punctuation-key" data-key="?" type="button">?</button><button class="key key-special punctuation-key" data-key="," type="button">,</button></div>` : "");
    $("keyboard").querySelectorAll("[data-key]").forEach((button) => button.addEventListener("click", () => keyPress(button.dataset.key)));
  }
  function keyPress(key) {
    if ($("checkAnswer").disabled || $("celebrate").hidden === false) return;
    if (key === "⇧") { state.shift = !state.shift; drawKeyboard(); return; }
    if (key === "⌫") state.typed = state.typed.slice(0, -1);
    else if (key === " " && state.mode !== "sentences") return;
    else if (key.length === 1 && state.typed.length < (state.mode === "sentences" ? 54 : 24)) { state.typed += state.shift && /[a-z]/i.test(key) ? key.toUpperCase() : key; if (/[a-z]/i.test(key)) state.shift = false; }
    drawAnswer();
  }
  function normalize(value) { return value.trim().toLocaleLowerCase().replace(/\s+/g, " ").replace(/[.!?,]+$/g, ""); }
  function checkAnswer() {
    if (!state.typed.trim()) { $("gameFeedback").textContent = "Choose a letter to get started."; return; }
    const target = activeItem().word;
    const actual = state.typed.trim().replace(/\s+/g, " ");
    const correct = state.mode === "sentences"
      ? actual === target
      : /[A-Z]/.test(target) ? actual === target : normalize(actual) === normalize(target);
    if (correct) {
      state.streak++; state.stars++; const stats = saved.stats[state.unit] || { stars: 0, correct: 0 }; stats.stars = state.stars; stats.correct = (stats.correct || 0) + 1; saved.stats[state.unit] = stats; persist();
      $("gameFeedback").textContent = "Your spelling has bloomed!"; $("gameFeedback").className = "game-feedback correct-message";
      $("celebrateWord").textContent = activeItem().word; $("celebrate").hidden = false; $("checkAnswer").disabled = true; $("streakPill").textContent = `✦ ${state.streak}`;
      if (navigator.vibrate) navigator.vibrate(16);
    } else {
      state.errors++; state.streak = 0; $("streakPill").textContent = "✦ 0";
      if (state.errors >= 3) {
        $("gameFeedback").textContent = `The word was “${activeItem().word}”. Let’s keep growing!`; $("gameFeedback").className = "game-feedback gentle-message";
        $("celebrateWord").textContent = activeItem().word; $("celebrate").querySelector("strong").textContent = "Keep on growing!"; $("celebrate").hidden = false; $("checkAnswer").disabled = true;
      } else {
        $("gameFeedback").textContent = "Not quite yet. Listen again and try another way."; $("gameFeedback").className = "game-feedback gentle-message";
        if (navigator.vibrate) navigator.vibrate([12, 26, 12]);
      }
    }
  }
  function finishGame() {
    state.screen = "done";
    $("keyboard").hidden = true; $("clearAnswer").hidden = true;
    $("listenHint").textContent = "Every little try helps your spelling grow.";
    $("answerArea").innerHTML = `<div class="finish-garden"><span>🌻</span><strong>Garden complete!</strong><small>You grew ${state.streak} in a row.</small></div>`;
    $("replayWord").hidden = true; $("checkAnswer").hidden = true; $("gameFeedback").textContent = "Wonderful listening and spelling today.";
    $("celebrate").hidden = false; $("celebrate").querySelector("strong").textContent = "Lovely work!"; $("celebrateWord").textContent = "Your garden is growing."; $("nextWord").textContent = "Practice again";
  }
  function leaveGame() {
    window.speechSynthesis?.cancel(); state.screen = "home";
    $("gameView").hidden = true; $("homeView").hidden = false; $("replayWord").hidden = false; $("checkAnswer").hidden = false; $("nextWord").innerHTML = "Next word <span>→</span>";
    $("keyboard").hidden = false; $("clearAnswer").hidden = false;
    $("celebrate").querySelector("strong").textContent = "Lovely spelling!"; renderHome(); window.scrollTo(0, 0);
  }
  function nextWord() {
    if (state.screen === "done") { leaveGame(); return; }
    state.round++; $("listenOrb").classList.remove("listening"); showRound(true);
  }

  $("parentToggle").addEventListener("click", showParent);
  $("closeParent").addEventListener("click", closeParent);
  $("closeParentBottom").addEventListener("click", closeParent);
  $("saveWords").addEventListener("click", () => { saved.lists[state.unit] = parseList($("customWords").value); persist(); $("savedNote").textContent = `${saved.lists[state.unit].length} ${saved.lists[state.unit].length === 1 ? "word" : "words"} saved for ${listLabel()}.`; renderHome(); });
  $("clearWords").addEventListener("click", () => { delete saved.lists[state.unit]; persist(); $("customWords").value = ""; $("savedNote").textContent = "This unit list is clear."; renderHome(); });
  $("startWords").addEventListener("click", () => startGame("words"));
  $("startTricky").addEventListener("click", () => startGame("tricky"));
  $("startWeekly").addEventListener("click", () => startGame("weekly"));
  $("startSentences").addEventListener("click", () => startGame("sentences"));
  $("leaveGame").addEventListener("click", leaveGame);
  $("replayWord").addEventListener("click", () => { if (activeItem()) speak(activeItem().word); });
  $("checkAnswer").addEventListener("click", checkAnswer);
  $("nextWord").addEventListener("click", nextWord);
  $("clearAnswer").addEventListener("click", () => { state.typed = ""; drawAnswer(); $("gameFeedback").textContent = "No hurry. Give it another try."; });
  document.addEventListener("keydown", (event) => {
    if (state.screen !== "game" || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === "Backspace") { event.preventDefault(); keyPress("⌫"); }
    else if (event.key === "Enter") { event.preventDefault(); $("celebrate").hidden ? checkAnswer() : nextWord(); }
    else if (event.key === "Shift") { state.shift = true; drawKeyboard(); }
    else if (event.key.length === 1 && /[a-z .,?!']/i.test(event.key)) { event.preventDefault(); keyPress(event.key); }
  });
  document.addEventListener("keyup", (event) => { if (event.key === "Shift" && state.shift) { state.shift = false; drawKeyboard(); } });
  renderHome();
})();
