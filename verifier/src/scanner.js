// Camera and image barcode reading with ZXing (zxing-cpp compiled to WASM).
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import zxingWasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";

// Serve the .wasm from our own origin. The library's default is a CDN, which
// would break offline use and leak scan activity to a third party.
prepareZXingModule({
  overrides: {
    locateFile: (path, prefix) => (path.endsWith(".wasm") ? zxingWasmUrl : prefix + path),
  },
});

const READER_OPTIONS = {
  formats: ["PDF417", "Aztec"],
  tryHarder: true,
  maxNumberOfSymbols: 1,
  // AAMVA payloads use raw control characters (LF, RS, CR) as separators.
  // The default text mode escapes them as "<LF>" etc., which breaks parsing.
  textMode: "Plain",
};

// Time between frame decode attempts. Dense license PDF417 codes take a
// noticeable slice of CPU on phones, so don't decode every animation frame.
const SCAN_INTERVAL_MS = 150;

/** Decode the first PDF417 or Aztec barcode in an image File/Blob. */
export async function readImage(file) {
  const [result] = await readBarcodes(file, READER_OPTIONS);
  return result ? { format: result.format, text: result.text } : null;
}

/**
 * Start the rear camera in `video` and resolve with the first barcode found.
 * Call the returned `stop()` to cancel; the promise then resolves to null.
 */
export function scanCamera(video) {
  let stream;
  let timer;
  let stopped = false;
  let finish;

  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    stream?.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
    finish?.(null);
  };

  const result = new Promise((resolve, reject) => {
    finish = resolve;

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });

    const tick = async () => {
      if (stopped) return;
      if (video.readyState >= video.HAVE_CURRENT_DATA && video.videoWidth) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0);
        const frame = context.getImageData(0, 0, canvas.width, canvas.height);
        try {
          const [hit] = await readBarcodes(frame, READER_OPTIONS);
          if (hit && !stopped) {
            const found = { format: hit.format, text: hit.text };
            finish = null;
            stop();
            resolve(found);
            return;
          }
        } catch (err) {
          stop();
          reject(err);
          return;
        }
      }
      timer = setTimeout(tick, SCAN_INTERVAL_MS);
    };

    navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          // License PDF417 codes are dense; ask for enough pixels to resolve them.
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      })
      .then(async (media) => {
        stream = media;
        if (stopped) {
          stop();
          return;
        }
        video.srcObject = media;
        await video.play();
        tick();
      })
      .catch((err) => {
        stopped = true;
        reject(err);
      });
  });

  return { result, stop };
}
