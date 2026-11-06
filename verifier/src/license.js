// Decode AAMVA (North American driver's license / ID card) PDF417 payloads.
//
// @syfaro/aamva-web is a wasm-pack "bundler" build that imports its .wasm
// directly. Instead of adding a Vite WASM plugin, load the binary by URL and
// wire it to the generated JS glue ourselves.
import * as glue from "@syfaro/aamva-web/aamva_web_bg.js";
import aamvaWasmUrl from "@syfaro/aamva-web/aamva_web_bg.wasm?url";

let ready;

function initAamva() {
  ready ??= (async () => {
    const imports = { "./aamva_web_bg.js": glue };
    const { instance } = await WebAssembly.instantiateStreaming(fetch(aamvaWasmUrl), imports);
    glue.__wbg_set_wasm(instance.exports);
    instance.exports.__wbindgen_start();
  })();
  return ready;
}

/** Parse a "YYYY-MM-DD" string as a calendar date (no time zone). */
function parseDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/** Today's calendar date in the device's local time zone. */
function today() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

function compareDates(a, b) {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

/** Whole years between `birth` and `on`, counting the birthday itself. */
export function ageOn(birth, on) {
  let age = on.year - birth.year;
  if (on.month < birth.month || (on.month === birth.month && on.day < birth.day)) age -= 1;
  return age;
}

function formatName(name) {
  if (!name) return null;
  return [name.prefix, name.first, name.middle, name.family, name.suffix].filter(Boolean).join(" ");
}

/**
 * Decode a PDF417 payload and evaluate age and expiration against today's date.
 * Throws if the payload is not an AAMVA barcode.
 */
export async function checkLicense(payload, now = today()) {
  await initAamva();
  const data = glue.decodeBarcode(payload);

  const birth = parseDate(data.date_of_birth);
  const expires = parseDate(data.document_expiration_date);

  return {
    name: formatName(data.name),
    dateOfBirth: data.date_of_birth ?? null,
    expirationDate: data.document_expiration_date ?? null,
    jurisdiction: data.address?.jurisdiction_code ?? null,
    age: birth ? ageOn(birth, now) : null,
    // A card is valid through its expiration date.
    expired: expires ? compareDates(now, expires) > 0 : null,
  };
}
