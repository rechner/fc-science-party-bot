import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

/**
 * Read the Ed25519 public key that matches the kiosk's JWT signing key and
 * return its raw 32 bytes as base64url (the JWK "x" value).
 *
 * The kiosk signs wristband JWTs with the OpenSSH private key at
 * JWT_PRIVATE_KEY_PATH, so the matching `.pub` line is what we embed here.
 * Only the public half ever reaches the browser.
 */
function loadWristbandPublicKey() {
  const raw = process.env.JWT_PUBLIC_KEY_PATH ?? "jwt-public-key.pub";
  const path = resolve(raw.replace(/^~(?=$|\/)/, homedir()));

  let line;
  try {
    line = readFileSync(path, "utf8").trim();
  } catch {
    throw new Error(
      `Wristband public key not found at ${path}. ` +
        "Export it with `ssh-keygen -y -f <kiosk private key> > verifier/jwt-public-key.pub` " +
        "or set JWT_PUBLIC_KEY_PATH.",
    );
  }

  const [type, body] = line.split(/\s+/);
  if (type !== "ssh-ed25519" || !body) {
    throw new Error(`${path} is not an OpenSSH ssh-ed25519 public key.`);
  }

  // OpenSSH wire format: string "ssh-ed25519", then string <32-byte key>,
  // each prefixed with a big-endian uint32 length.
  const blob = Buffer.from(body, "base64");
  const typeLen = blob.readUInt32BE(0);
  const keyLen = blob.readUInt32BE(4 + typeLen);
  const key = blob.subarray(8 + typeLen, 8 + typeLen + keyLen);
  if (blob.subarray(4, 4 + typeLen).toString() !== "ssh-ed25519" || key.length !== 32) {
    throw new Error(`${path} does not contain a valid Ed25519 key.`);
  }
  return key.toString("base64url");
}

// Lock the built app to its own origin: no third-party scripts or network
// calls, so scanned ID data has nowhere to go. 'wasm-unsafe-eval' is required
// to compile the ZXing and AAMVA WebAssembly modules.
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob: mediastream:",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

function contentSecurityPolicy() {
  return {
    name: "content-security-policy",
    apply: "build",
    transformIndexHtml: () => [
      {
        tag: "meta",
        attrs: { "http-equiv": "Content-Security-Policy", content: CONTENT_SECURITY_POLICY },
        injectTo: "head-prepend",
      },
    ],
  };
}

export default defineConfig({
  // Relative asset paths so the build works from any static host sub-path.
  base: "./",
  define: {
    __WRISTBAND_PUBLIC_KEY_X__: JSON.stringify(loadWristbandPublicKey()),
  },
  build: {
    target: "es2022",
  },
  server: {
    // Keep the dev server on loopback. Camera access needs a secure context,
    // which localhost satisfies.
    host: "127.0.0.1",
  },
  preview: {
    host: "127.0.0.1",
  },
  plugins: [
    contentSecurityPolicy(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "script-defer",
      includeAssets: ["icons/*.png"],
      manifest: {
        name: "Science Party Verifier",
        short_name: "Verifier",
        description: "Check ID barcodes and Science Party wristbands offline.",
        theme_color: "#212529",
        background_color: "#f8f9fa",
        display: "standalone",
        orientation: "portrait",
        start_url: "./",
        scope: "./",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Precache the WASM decoders so scanning works with no network.
        globPatterns: ["**/*.{js,css,html,png,wasm}"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
});
