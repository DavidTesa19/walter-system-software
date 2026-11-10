// "Nainstalovat aplikaci": puts Walter System on the phone's home screen (or in
// the computer's apps), where it opens on its own without the browser's bars.
// Chrome and Edge hand over their own install prompt; Safari on an iPhone has
// none, so there the button explains the two taps. Hidden once the app runs
// installed.

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

  if (prompt) {
    return (
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

  return null;
}
