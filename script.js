// Configure your HTTP endpoint here.
const HTTP_ENDPOINT =
  "https://defaultff6ba2824f544b34b3ee2dfa83ff71.b2.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/e37e49114c9f45ba9212561f8d20f5cc/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=hHlIPWojRFAbFF90MEL4_SJzwPkKRwTzm7VCPEQ8qFE";

// Form & steps
const form = document.getElementById("fitForm");
const steps = document.querySelectorAll(".step");
const stepLabel = document.getElementById("stepLabel");
const progressFill = document.getElementById("progressFill");
const formMessage = document.getElementById("formMessage");
const fitScoreDisplay = document.getElementById("fitScoreDisplay");
const resultFitScore = document.getElementById("resultFitScore");

// Inputs (basic info)
const fullName = document.getElementById("fullName");
const email = document.getElementById("email");
const company = document.getElementById("company");
const role = document.getElementById("role");

// Inputs (company info)
const teamSize = document.getElementById("teamSize");
const primaryWork = document.getElementById("primaryWork");
const tools = document.getElementById("tools");

// Navigation buttons
document.getElementById("next1").addEventListener("click", onNext1);
document.getElementById("back2").addEventListener("click", () => goToStep(1));
document.getElementById("next2").addEventListener("click", onNext2);
document.getElementById("back3").addEventListener("click", () => goToStep(2));
document.getElementById("next3").addEventListener("click", onNext3);
document.getElementById("back4").addEventListener("click", () => goToStep(3));
document.getElementById("finishBtn").addEventListener("click", () => {
  formMessage.className = "form-message success";
  formMessage.textContent =
    "Thanks for running the fit check. Your responses have been recorded.";
});

// State
let currentStep = 1;
const totalSteps = steps.length;
let maxCompletedStep = 0;

// Company-size-only percentage (0–99) from the piecewise rule
let sizePercent = null;

// Combined fit: raw (uncapped) and capped percent (0–100)
let latestFitRaw = null;
let latestFitPercent = null;

// Per-question scale answers, mapping questionId -> 0, 0.5, 1, 1.5, 2
const scaleAnswers = {};

// Store display fit after each contributing step (for progressive display)
const fitAfterStep = {};

// Step map for labels
const stepLabels = {
  1: "Step 1 of 4 · Basic info",
  2: "Step 2 of 4 · Your company",
  3: "Step 3 of 4 · How it feels day to day",
  4: "Step 4 of 4 · Your fit score",
};

// ---- Navigation helpers ----

function goToStep(step) {
  currentStep = step;

  steps.forEach((s) => {
    const index = Number(s.dataset.step);
    s.classList.toggle("active", index === currentStep);
  });

  stepLabel.textContent = stepLabels[currentStep] || "";
  progressFill.style.width = `${(currentStep / totalSteps) * 100}%`;

  updateFitChipForCurrentStep();
  clearMessage();
}

function updateFitChipForCurrentStep() {
  let display = "N/A";

  // Step 1 & 2: no score shown
  if (currentStep === 1 || currentStep === 2) {
    display = "N/A";
  } else {
    // Show score based on all contributing values up to the previous step
    const prevStep = currentStep - 1;
    const prevFit = fitAfterStep[prevStep];

    if (typeof prevFit === "number") {
      display = `${prevFit}%`;
    } else {
      display = "N/A";
    }
  }

  fitScoreDisplay.textContent = display;
}

// ---- Validation helpers ----

function showError(msg) {
  formMessage.className = "form-message error";
  formMessage.textContent = msg;
}

function clearMessage() {
  formMessage.className = "form-message";
  formMessage.textContent = "";
}

function validateEmailFormat(value) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim());
}

function validateStep1() {
  clearMessage();
  if (!fullName.value.trim() || !email.value.trim()) {
    showError("Please enter at least your name and a valid email.");
    return false;
  }
  if (!validateEmailFormat(email.value)) {
    showError("That email doesn’t look quite right yet.");
    return false;
  }
  return true;
}

function validateStep2() {
  clearMessage();
  const raw = teamSize.value.trim();
  const parsed = parseInt(raw, 10);

  if (!raw || Number.isNaN(parsed) || parsed < 1) {
    showError("Please enter your rough company size as a positive whole number.");
    return false;
  }
  return true;
}

function validateStep3() {
  clearMessage();
  const scaleBlocks = document.querySelectorAll(".scale-question");
  for (const block of scaleBlocks) {
    const name = `q_${block.dataset.questionId}`;
    const checked = document.querySelector(
      `input[name="${name}"]:checked`
    );
    if (!checked) {
      showError("Please answer all fit questions before continuing.");
      return false;
    }
  }
  return true;
}

// ---- Calculation helpers ----

// Company-size-only % (first contributing value)
//
// Company size < 10      -> 0
// 10 <= size <= 109      -> size - 10
// size > 109             -> 99
function calculateSizePercent(size) {
  if (!Number.isFinite(size) || size < 10) return 0;
  if (size <= 109) return size - 10;
  return 99;
}

// Combined fit for later stages.
//
// New spec:
//   - use same "S - 10, capped at 99" base as initial calculation
//   - answers are 0, 0.5, 1, 1.5, 2
//   - rawFit    = avgScale * baseSize
//   - fitPercent = min(100, round(rawFit))
function calculateCombinedFit(companySize, scaleArray) {
  if (
    !Number.isFinite(companySize) ||
    companySize <= 0 ||
    !Array.isArray(scaleArray) ||
    scaleArray.length === 0
  ) {
    return { raw: null, percent: null };
  }

  // baseSize matches the initial sizePercent logic (S - 10 with caps)
  const baseSize = calculateSizePercent(companySize);

  if (baseSize <= 0) {
    return { raw: 0, percent: 0 };
  }

  const sum = scaleArray.reduce((acc, v) => acc + v, 0);
  const avgScale = sum / scaleArray.length;

  const raw = avgScale * baseSize;
  let percent = Math.round(raw);

  if (percent > 100) percent = 100;
  if (percent < 0) percent = 0;

  return { raw, percent };
}

function updateScaleAnswersFromDOM() {
  const scaleBlocks = document.querySelectorAll(".scale-question");
  scaleBlocks.forEach((block) => {
    const qid = block.dataset.questionId;
    const name = `q_${qid}`;
    const checked = document.querySelector(
      `input[name="${name}"]:checked`
    );
    if (checked) {
      scaleAnswers[qid] = parseFloat(checked.value);
    }
  });
}

// ---- Payload / HTTP ----

function buildPayload(stepForPayload) {
  const sizeValue = teamSize.value.trim();
  const parsedSize = parseInt(sizeValue, 10);
  const companySize =
    sizeValue === "" || Number.isNaN(parsedSize) ? 0 : parsedSize;

  const scaleArray = Object.values(scaleAnswers).filter(
    (v) => typeof v === "number"
  );
  const scaleAverage =
    scaleArray.length > 0
      ? scaleArray.reduce((s, v) => s + v, 0) / scaleArray.length
      : null;

  return {
    step: stepForPayload,
    fullName: fullName.value.trim(),
    email: email.value.trim(),
    company: company.value.trim(),
    role: role.value.trim(),
    companySize: companySize,
    primaryWork: primaryWork.value.trim(),
    tools: tools.value.trim(),
    sizePercent: sizePercent,
    scaleAnswers: { ...scaleAnswers },
    scaleAverage: scaleAverage,
    fitPercent: latestFitPercent,
    fitRaw: latestFitRaw,
  };
}

async function sendPageUpdate(method, stepForPayload) {
  if (!HTTP_ENDPOINT) return;
  const payload = buildPayload(stepForPayload);

  try {
    await fetch(HTTP_ENDPOINT, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error(`${method} failed:`, err);
    // Soft failure, do not block navigation
  }
}

// ---- Step handlers ----

async function onNext1() {
  if (!validateStep1()) return;

  maxCompletedStep = Math.max(maxCompletedStep, 1);
  await sendPageUpdate("POST", 1);
  goToStep(2);
}

async function onNext2() {
  if (!validateStep2()) return;

  const parsedSize = parseInt(teamSize.value.trim(), 10);
  sizePercent = calculateSizePercent(parsedSize);

  // After completing step 2, contributor is company size only.
  fitAfterStep[2] = sizePercent;
  latestFitRaw = null;
  latestFitPercent = null;

  maxCompletedStep = Math.max(maxCompletedStep, 2);
  await sendPageUpdate("PUT", 2);
  goToStep(3);
}

async function onNext3() {
  if (!validateStep3()) return;

  // Collect all scale answers and compute combined fit.
  updateScaleAnswersFromDOM();
  const scaleArray = Object.values(scaleAnswers).filter(
    (v) => typeof v === "number"
  );

  const sizeValue = teamSize.value.trim();
  const parsedSize = parseInt(sizeValue, 10);
  const companySize =
    sizeValue === "" || Number.isNaN(parsedSize) ? 0 : parsedSize;

  const combined = calculateCombinedFit(companySize, scaleArray);
  latestFitRaw = combined.raw;
  latestFitPercent = combined.percent;

  fitAfterStep[3] = latestFitPercent;

  // Set result text for step 4.
  resultFitScore.textContent =
    typeof latestFitPercent === "number"
      ? `${latestFitPercent}%`
      : "N/A";

  maxCompletedStep = Math.max(maxCompletedStep, 3);
  await sendPageUpdate("PUT", 3);
  goToStep(4);
}

// ---- Initialize ----

goToStep(1);
