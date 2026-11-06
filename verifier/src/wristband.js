// Verify wristband JWTs issued by the kiosk (wristband.py).
//
// The kiosk signs with Ed25519 ("EdDSA"). The matching public key is embedded
// at build time by vite.config.js, so verification works fully offline.
import { importJWK, jwtVerify, errors } from "jose";

/* global __WRISTBAND_PUBLIC_KEY_X__ */
const keyPromise = importJWK(
  { kty: "OKP", crv: "Ed25519", x: __WRISTBAND_PUBLIC_KEY_X__ },
  "EdDSA",
);

/**
 * Returns { valid: true, claims } for a token signed by the kiosk key, or
 * { valid: false, reason } otherwise. Never throws for bad tokens.
 */
export async function checkWristband(token) {
  try {
    const { payload } = await jwtVerify(token.trim(), await keyPromise, {
      // Pin the algorithm so a token can't pick a weaker one (e.g. "none").
      algorithms: ["EdDSA"],
      requiredClaims: ["sub", "iat"],
    });
    return { valid: true, claims: payload };
  } catch (err) {
    if (err instanceof errors.JOSEError) {
      return { valid: false, reason: "signature or claims did not verify" };
    }
    throw err;
  }
}
