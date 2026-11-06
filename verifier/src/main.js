import "bootstrap/dist/css/bootstrap.min.css";
import "./style.css";

import { checkLicense } from "./license.js";
import { readImage, scanCamera } from "./scanner.js";
import { checkWristband } from "./wristband.js";

const scanButton = document.getElementById("scan-button");
const photoInput = document.getElementById("photo-input");
const camera = document.getElementById("camera");
const preview = document.getElementById("camera-preview");
const cancelButton = document.getElementById("cancel-button");
const resultArea = document.getElementById("result");

let activeScan = null;

/**
 * Tiny DOM builder. Text is always assigned via textContent, so scanned data
 * can never be interpreted as HTML.
 */
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) {
    if (child == null) continue;
    node.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

function banner(tone, title, detail) {
  return el(
    "div",
    { class: `alert alert-${tone} text-center`, role: tone === "danger" ? "alert" : "status" },
    el("div", { class: "display-6 fw-bold" }, title),
    detail ? el("div", { class: "fs-5 mt-1" }, detail) : null,
  );
}

function details(rows) {
  const list = el("dl", { class: "row fs-5 mb-0" });
  for (const [label, value] of rows) {
    list.append(
      el("dt", { class: "col-5" }, label),
      el("dd", { class: "col-7" }, value ?? el("span", { class: "text-body-secondary" }, "Unknown")),
    );
  }
  return list;
}

function card(...children) {
  return el("div", { class: "card shadow-sm" }, el("div", { class: "card-body" }, ...children));
}

function showResult(...nodes) {
  const clear = el("button", { type: "button", class: "btn btn-outline-secondary w-100 mt-3" }, "Clear");
  clear.addEventListener("click", resetResult);
  resultArea.replaceChildren(...nodes, clear);
}

function resetResult() {
  resultArea.replaceChildren();
}

function ageBanner(age) {
  if (age == null) return banner("secondary", "Age unknown", "No date of birth on the barcode");
  if (age >= 21) return banner("success", "21+", `Age ${age}`);
  if (age >= 18) return banner("warning", "18 to 20", `Age ${age}. Do not serve alcohol.`);
  return banner("danger", "Under 18", `Age ${age}`);
}

function renderLicense(info) {
  const nodes = [];
  if (info.expired) {
    nodes.push(banner("danger", "EXPIRED ID", `Expired ${info.expirationDate}`));
  } else if (info.expired == null) {
    nodes.push(banner("secondary", "Expiration unknown", "No expiration date on the barcode"));
  }
  nodes.push(ageBanner(info.age));

  const expiryBadge =
    info.expired == null
      ? null
      : el(
          "span",
          { class: `badge ms-2 text-bg-${info.expired ? "danger" : "success"}` },
          info.expired ? "Expired" : "Valid",
        );

  nodes.push(
    card(
      el("h2", { class: "h5 card-title" }, "Driver's license / ID"),
      details([
        ["Name", info.name],
        ["Date of birth", info.dateOfBirth],
        ["Age", info.age == null ? null : String(info.age)],
        ["Expires", info.expirationDate ? el("span", {}, info.expirationDate, expiryBadge) : null],
        ["Issuer", info.jurisdiction],
      ]),
      el(
        "p",
        { class: "small text-body-secondary mt-3 mb-0" },
        "This reads the barcode only. Check the photo and the card's security features too.",
      ),
    ),
  );
  showResult(...nodes);
}

function renderWristband(check) {
  if (!check.valid) {
    showResult(
      banner("danger", "Invalid wristband", "Not signed by the Science Party kiosk"),
    );
    return;
  }
  const { claims } = check;
  const age = claims["21+"]
    ? banner("success", "21+")
    : claims["18+"]
      ? banner("warning", "18 to 20", "Do not serve alcohol.")
      : banner("danger", "Under 18");
  const issued = typeof claims.iat === "number" ? new Date(claims.iat * 1000).toLocaleString() : null;

  showResult(
    banner("success", "Valid wristband"),
    age,
    card(
      el("h2", { class: "h5 card-title" }, "Wristband"),
      details([
        ["Name", typeof claims.name === "string" ? claims.name : null],
        ["ID", String(claims.sub)],
        ["Issued", issued],
      ]),
    ),
  );
}

function renderError(title, detail) {
  showResult(banner("warning", title, detail));
}

async function handleBarcode(barcode) {
  if (!barcode) {
    renderError("No barcode found", "Try again with the barcode filling more of the frame.");
    return;
  }
  if (barcode.format.startsWith("PDF417")) {
    try {
      renderLicense(await checkLicense(barcode.text));
    } catch {
      renderError("Not a license barcode", "This PDF417 code isn't AAMVA ID data.");
    }
  } else if (barcode.format.startsWith("Aztec")) {
    renderWristband(await checkWristband(barcode.text));
  } else {
    renderError("Unsupported barcode", barcode.format);
  }
}

function setScanning(scanning) {
  camera.hidden = !scanning;
  scanButton.disabled = scanning;
  photoInput.disabled = scanning;
}

scanButton.addEventListener("click", async () => {
  resetResult();
  setScanning(true);
  activeScan = scanCamera(preview);
  try {
    const barcode = await activeScan.result;
    if (barcode) await handleBarcode(barcode);
  } catch (err) {
    const denied = err?.name === "NotAllowedError";
    renderError(
      denied ? "Camera blocked" : "Camera error",
      denied ? "Allow camera access for this site, or use From photo." : String(err?.message ?? err),
    );
  } finally {
    activeScan = null;
    setScanning(false);
  }
});

cancelButton.addEventListener("click", () => activeScan?.stop());

photoInput.addEventListener("change", async () => {
  const [file] = photoInput.files;
  photoInput.value = "";
  if (!file) return;
  resetResult();
  try {
    await handleBarcode(await readImage(file));
  } catch (err) {
    renderError("Could not read image", String(err?.message ?? err));
  }
});

// Don't leave someone's ID details or a live camera on screen when the app
// goes to the background.
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    activeScan?.stop();
    resetResult();
  }
});
