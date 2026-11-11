// On a phone the subject and zakázka tables show either cards (one record per
// card, the default) or a dense table. The choice is shared by the header's
// switch and all three sections, and remembered on the device.

import { useSyncExternalStore } from 'react';

export type PhoneView = 'cards' | 'table';

const STORAGE_KEY = 'walterGrid.phoneView';
const listeners = new Set<() => void>();

const read = (): PhoneView => {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'table' ? 'table' : 'cards';
  } catch {
    return 'cards';
  }
};

let current: PhoneView = read();

export const getPhoneView = () => current;

export const setPhoneView = (view: PhoneView) => {
  if (view === current) return;
  current = view;
  try {
    localStorage.setItem(STORAGE_KEY, view);
  } catch {
    // Not remembered, still applied.
  }
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const usePhoneView = () => useSyncExternalStore(subscribe, getPhoneView);
