// Inside the Android app (android/, Android's built-in WebView), files the page
// makes in memory have nowhere to go: a WebView ignores <a download> on a
// blob: URL and cannot show a PDF opened with window.open(blob). The app
// exposes a message channel, `WalterAndroid`, to this site only; this module
// hands such files to it, and the app saves them to Downloads and opens them.
// In a browser the channel does not exist and nothing here runs.
//
// It lives on the web side on purpose: a fix here reaches every installed app
// with the next deploy, without a new .apk.

interface AndroidBridge {
  postMessage(message: string): void;
}

const bridge = (window as unknown as { WalterAndroid?: AndroidBridge }).WalterAndroid;

/** True inside the Android app (the user agent carries WalterSystemApp/x). */
export const isAndroidApp = (): boolean =>
  Boolean(bridge) || /\bWalterSystemApp\//.test(navigator.userAgent);

const isMemoryUrl = (url: string) => url.startsWith('blob:') || url.startsWith('data:');

const toBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

async function sendFile(url: string, filename: string, open: boolean) {
  if (!bridge) return;
  try {
    const blob = await (await fetch(url)).blob();
    bridge.postMessage(
      JSON.stringify({ type: 'file', data: await toBase64(blob), filename, mime: blob.type, open }),
    );
  } catch (error) {
    console.error('Soubor se nepodařilo předat aplikaci', error);
  }
}

if (bridge) {
  // Download code revokes its blob: URL right after link.click(), before the
  // file could be read here; keep each one alive for two minutes instead.
  const revoke = URL.revokeObjectURL.bind(URL);
  URL.revokeObjectURL = (url: string) => {
    window.setTimeout(() => revoke(url), 120_000);
  };

  // <a download href="blob:..."> (utils/api.ts, Jarvis's documents). Capture
  // phase: the links are clicked programmatically and removed right after.
  document.addEventListener(
    'click',
    (event) => {
      const link = (event.target as Element | null)?.closest?.('a');
      if (!link || !link.hasAttribute('download') || !isMemoryUrl(link.href)) return;
      event.preventDefault();
      void sendFile(link.href, link.getAttribute('download') || '', false);
    },
    true,
  );

  // window.open(blob) shows a document in a new tab in a browser; in the app
  // it is opened in the phone's viewer (PDF, Word...). Other addresses go on
  // to the app, which opens them in the right app.
  const open = window.open.bind(window);
  window.open = (url?: string | URL, target?: string, features?: string) => {
    const address = url === undefined ? '' : String(url);
    if (isMemoryUrl(address)) {
      void sendFile(address, '', true);
      return null;
    }
    return open(url, target, features);
  };
}
