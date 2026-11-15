// Whether Jarvis uses its memory (notes about the user) on this device:
// Jarvis › Nastavení › Paměť. Off sends `memory: false` with each question,
// and the server then neither shows Jarvis the notes nor lets it save new ones.

const KEY = 'walterJarvisMemory';

export const memoryEnabled = (): boolean => {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
};

export const setMemoryEnabled = (enabled: boolean) => {
  try {
    if (enabled) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, 'off');
  } catch {
    // Remembering the switch is a convenience only.
  }
};
