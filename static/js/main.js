/**
 * Whole years old today. Accepts "YYYY-MM-DD" (or anything Date can parse).
 *
 * A bare "YYYY-MM-DD" is read as a local calendar date. `new Date("2005-03-23")`
 * would mean UTC midnight, which is the previous evening in US time zones, and
 * would make someone 21 a day early.
 */
function calculateAge (birthDate) {
    // A failed AAMVA parse sends null. new Date(null) is 1 Jan 1970 (age 56),
    // so reject missing or unparseable dates instead of coercing them.
    if (birthDate === null || birthDate === undefined || String(birthDate).trim() === "") {
        return null;
    }
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(birthDate));
    birthDate = match
        ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
        : new Date(birthDate);
    if (Number.isNaN(birthDate.getTime())) {
        return null;
    }
    let today = new Date();

    let years = (today.getFullYear() - birthDate.getFullYear());

    if (today.getMonth() < birthDate.getMonth() ||
        today.getMonth() == birthDate.getMonth() && today.getDate() < birthDate.getDate()) {
        years--;
    }

    // A birthday in the future or an impossible age is a bad read, not a guest.
    return (years >= 0 && years <= 120) ? years : null;
}

/*
 * ID scans can arrive before the Telegram QR code. The age is held here
 * between pages, and only briefly, so it can't attach to the next guest.
 * Only the age is kept, never the date of birth or other ID data.
 */
const PENDING_ID_KEY = "checkin.pendingId";
const PENDING_ID_TTL_MS = 2 * 60 * 1000;

function savePendingAge(age) {
    sessionStorage.setItem(PENDING_ID_KEY, JSON.stringify({ age: age, at: Date.now() }));
}

/** The age from a recent ID scan, or null. */
function peekPendingAge() {
    try {
        const pending = JSON.parse(sessionStorage.getItem(PENDING_ID_KEY));
        if (pending && Number.isInteger(pending.age) && Date.now() - pending.at < PENDING_ID_TTL_MS) {
            return pending.age;
        }
    } catch {
        // Fall through and clear anything unreadable.
    }
    clearPendingAge();
    return null;
}

function clearPendingAge() {
    sessionStorage.removeItem(PENDING_ID_KEY);
}

/* Auto-print preference, kept on this kiosk across reloads. */
const AUTO_PRINT_KEY = "checkin.autoPrint";

function autoPrintEnabled() {
    return localStorage.getItem(AUTO_PRINT_KEY) === "true";
}

function setAutoPrint(enabled) {
    localStorage.setItem(AUTO_PRINT_KEY, enabled ? "true" : "false");
}

// Wire up any auto-print switch on the page (see templates/_autoprint.html).
document.addEventListener("DOMContentLoaded", () => {
    for (const toggle of document.querySelectorAll(".autoprint-toggle")) {
        toggle.checked = autoPrintEnabled();
        toggle.addEventListener("change", () => {
            setAutoPrint(toggle.checked);
            document.dispatchEvent(new CustomEvent("autoprintchange", { detail: toggle.checked }));
        });
    }
});
