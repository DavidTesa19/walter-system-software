// Getting Walter System as an app, from the sidebar. Android links to /stahnout
// (the .apk built from android/); an iPhone gets the two Safari taps explained;
// a computer gets the browser's own install prompt where Chrome/Edge offer one,
// plus "Aplikace do telefonu" (the download page with a QR code). Hidden once
// the app runs installed (the Android app reports standalone too).

import { useEffect, useState } from 'react';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// The browser offers the prompt once, early (often while the login screen is
// up), so it is caught when this module loads (main.tsx imports it) and kept.
let deferredPrompt: InstallPromptEvent | null = null;
const subscribers = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event as InstallPromptEvent;
    subscribers.forEach((notify) => notify());
  });
}

const isInstalled = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

// iPadOS reports itself as a Mac; the touch points give it away.
const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const isAndroid = () => /android/i.test(navigator.userAgent);

export default function InstallAppButton() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(deferredPrompt);
  const [installed, setInstalled] = useState(isInstalled);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    const notify = () => setPrompt(deferredPrompt);
    const onInstalled = () => {
      deferredPrompt = null;
      setPrompt(null);
      setInstalled(true);
    };
    subscribers.add(notify);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      subscribers.delete(notify);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) return null;

  // Android gets the real app (an .apk from /stahnout) rather than the
  // browser's shortcut install.
  if (isAndroid()) {
    return (
      <a className="sidebar-button install-app-button" href="/stahnout">
        Stáhnout aplikaci
      </a>
    );
  }

  if (isIos()) {
    return (
      <>
        <button
          type="button"
          className="sidebar-button install-app-button"
          aria-expanded={showIosHelp}
          onClick={() => setShowIosHelp((shown) => !shown)}
        >
          Přidat na plochu
        </button>
        {showIosHelp && (
          <p className="install-app-help">
            V Safari klepněte dole na <strong>Sdílet</strong> (čtverec se šipkou) a vyberte <strong>Přidat na plochu</strong>.
          </p>
        )}
      </>
    );
  }

  // A computer: its own install (Chrome/Edge), and the download page with a
  // QR code for getting the app onto a phone.
  return (
    <>
      {prompt && (
        <button
          type="button"
          className="sidebar-button install-app-button"
          onClick={async () => {
            await prompt.prompt();
            const choice = await prompt.userChoice;
            // A prompt can be shown only once; the browser offers a new one later.
            deferredPrompt = null;
            setPrompt(null);
            if (choice.outcome === 'accepted') setInstalled(true);
          }}
        >
          Nainstalovat aplikaci
        </button>
      )}
      <a className="sidebar-button install-app-button" href="/stahnout" target="_blank" rel="noopener">
        Aplikace do telefonu
      </a>
    </>
  );
}
