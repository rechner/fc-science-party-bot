# fc-science-party-bot

## Verifier PWA (`verifier/`)

A static, offline-capable web app for door staff. It runs separately from the
kiosk and needs no server of its own.

- **Driver's license / ID (PDF417):** decodes the AAMVA barcode on the back of
  the card, shows the holder's age and whether the card is expired.
- **Wristband (Aztec):** verifies the kiosk-issued JWT (EdDSA) and shows the
  encoded name, ID, age flags and issue time.

All scanning and verification happens on the device. Nothing is uploaded or
stored, and the built app's Content Security Policy blocks third-party requests.

### Build

1. Export the public half of the kiosk's JWT signing key (the file at
   `JWT_PRIVATE_KEY_PATH`, default `~/.ssh/id_ed25519`):

   ```sh
   ssh-keygen -y -f ~/.ssh/id_ed25519 > verifier/jwt-public-key.pub
   ```

   Or point `JWT_PUBLIC_KEY_PATH` at an existing `.pub` file. The build fails
   if the key is missing.

2. Install and build:

   ```sh
   cd verifier
   npm ci
   npm run build
   ```

3. Host the `verifier/dist/` folder on any static host. Camera access needs
   HTTPS (or `localhost`).

Rebuild whenever the kiosk signing key changes. Wristbands signed with the old
key will then show as invalid.

### Develop

```sh
cd verifier
npm run dev      # http://127.0.0.1:5173
npm run preview  # serve the production build locally
```
