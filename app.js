const STORAGE_KEY = "hebrewTrainer.today.v1";
const TARGET_MASTERED = 50;

const hebrewWordEl = document.getElementById("hebrewWord");
const translationEl = document.getElementById("translation");
const revealBtn = document.getElementById("revealBtn");
const correctBtn = document.getElementById("correctBtn");
const wrongBtn = document.getElementById("wrongBtn");
const resetBtn = document.getElementById("resetBtn");

const phaseLabelEl = document.getElementById("phaseLabel");
const masteredCountEl = document.getElementById("masteredCount");
const unknownCountEl = document.getElementById("unknownCount");
const firstPassLeftEl = document.getElementById("firstPassLeft");
const activeCountEl = document.getElementById("activeCount");
const packageSizeEl = document.getElementById("packageSize");

let wordsById = new Map();
let state;
let currentWordId = null;

init().catch((error) => {
  console.error(error);
  hebrewWordEl.textContent = "Failed to load words.";
});

async function init() {
  const words = await loadWords();
  wordsById = new Map(words.map((w) => [w.id, w]));
  state = loadState(words);
  ensureCurrentWord();
  bindEvents();
  render();
}

function bindEvents() {
  revealBtn.addEventListener("click", () => {
    translationEl.classList.remove("hidden");
  });

  correctBtn.addEventListener("click", () => answer(true));
  wrongBtn.addEventListener("click", () => answer(false));
  resetBtn.addEventListener("click", resetToday);
}

async function loadWords() {
  const response = await fetch("words.json");
  if (!response.ok) {
    throw new Error(`Could not load words.json (${response.status})`);
  }
  return response.json();
}

function loadState(words) {
  const dayStamp = new Date().toISOString().slice(0, 10);
  const allIds = words.map((w) => w.id);
  const defaultState = {
    dayStamp,
    unknownIds: [...allIds],
    masteredToday: [],
    firstPassQueue: shuffle([...allIds]),
    firstPassDone: false,
    packageSize: 3,
    packageStarted: false,
    activeIds: [],
    consecutiveCorrect: {}
  };

  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    saveState(defaultState);
    return defaultState;
  }

  try {
    const parsed = JSON.parse(raw);
    if (parsed.dayStamp !== dayStamp) {
      saveState(defaultState);
      return defaultState;
    }

    const safeUnknown = (parsed.unknownIds || []).filter((id) => wordsById.has(id));
    const safeMastered = (parsed.masteredToday || []).filter((id) => wordsById.has(id));

    const merged = {
      ...defaultState,
      ...parsed,
      unknownIds: safeUnknown,
      masteredToday: safeMastered,
      firstPassQueue: (parsed.firstPassQueue || []).filter((id) => wordsById.has(id)),
      activeIds: (parsed.activeIds || []).filter((id) => wordsById.has(id)),
      consecutiveCorrect: parsed.consecutiveCorrect || {}
    };

    merged.masteredToday = unique(merged.masteredToday);
    merged.unknownIds = unique(merged.unknownIds.filter((id) => !merged.masteredToday.includes(id)));

    if (merged.firstPassQueue.length === 0) {
      merged.firstPassDone = true;
    }

    saveState(merged);
    return merged;
  } catch {
    saveState(defaultState);
    return defaultState;
  }
}

function saveState(nextState = state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
}

function answer(isCorrect) {
  if (currentWordId == null) {
    return;
  }

  if (!state.firstPassDone) {
    answerFirstPass(isCorrect);
  } else {
    answerPackage(isCorrect);
  }

  ensureCurrentWord();
  saveState();
  render();
}

function answerFirstPass(isCorrect) {
  const id = currentWordId;
  state.firstPassQueue = state.firstPassQueue.filter((wordId) => wordId !== id);

  if (isCorrect) {
    markMastered(id);
  }

  if (state.firstPassQueue.length === 0) {
    state.firstPassDone = true;
    refillActiveIfNeeded();
  }
}

function answerPackage(isCorrect) {
  const id = currentWordId;
  if (isCorrect) {
    const next = (state.consecutiveCorrect[id] || 0) + 1;
    state.consecutiveCorrect[id] = next;

    if (next >= 2) {
      markMastered(id);
      state.activeIds = state.activeIds.filter((wordId) => wordId !== id);
      delete state.consecutiveCorrect[id];
    }
  } else {
    state.consecutiveCorrect[id] = 0;
  }

  refillActiveIfNeeded();
}

function refillActiveIfNeeded() {
  if (!state.firstPassDone) {
    return;
  }

  if (state.masteredToday.length >= TARGET_MASTERED || state.unknownIds.length === 0) {
    state.activeIds = [];
    return;
  }

  if (state.activeIds.length > 0) {
    return;
  }

  if (!state.packageStarted) {
    state.packageStarted = true;
  } else {
    state.packageSize += 3;
  }
  const pickCount = Math.min(state.packageSize, state.unknownIds.length);
  state.activeIds = pickRandom(state.unknownIds, pickCount);

  for (const id of state.activeIds) {
    if (!(id in state.consecutiveCorrect)) {
      state.consecutiveCorrect[id] = 0;
    }
  }
}

function ensureCurrentWord() {
  if (!state.firstPassDone) {
    currentWordId = state.firstPassQueue[0] ?? null;
    return;
  }

  if (state.masteredToday.length >= TARGET_MASTERED || state.unknownIds.length === 0) {
    currentWordId = null;
    return;
  }

  refillActiveIfNeeded();

  if (state.activeIds.length === 0) {
    currentWordId = null;
    return;
  }

  currentWordId = state.activeIds[Math.floor(Math.random() * state.activeIds.length)];
}

function markMastered(id) {
  if (!state.masteredToday.includes(id)) {
    state.masteredToday.push(id);
  }
  state.unknownIds = state.unknownIds.filter((wordId) => wordId !== id);
}

function resetToday() {
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
}

function render() {
  const activeWord = currentWordId != null ? wordsById.get(currentWordId) : null;

  if (activeWord) {
    hebrewWordEl.textContent = activeWord.hebrew;
    translationEl.textContent = activeWord.translation;
    translationEl.classList.add("hidden");
    revealBtn.disabled = false;
    correctBtn.disabled = false;
    wrongBtn.disabled = false;
  } else {
    hebrewWordEl.textContent = "✅ Session complete for today";
    translationEl.textContent = "Reset to start over.";
    translationEl.classList.remove("hidden");
    revealBtn.disabled = true;
    correctBtn.disabled = true;
    wrongBtn.disabled = true;
  }

  phaseLabelEl.textContent = state.firstPassDone ? "Packages" : "First Pass";
  masteredCountEl.textContent = String(state.masteredToday.length);
  unknownCountEl.textContent = String(state.unknownIds.length);
  firstPassLeftEl.textContent = String(state.firstPassQueue.length);
  activeCountEl.textContent = String(state.activeIds.length);
  packageSizeEl.textContent = String(state.packageSize);
}

function pickRandom(list, count) {
  return shuffle([...list]).slice(0, count);
}

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function unique(list) {
  return [...new Set(list)];
}
