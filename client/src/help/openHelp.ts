// Opens the help panel for the current screen from anywhere: the sidebar's
// "?" next to the account sends this, FloatingTools (which owns the panel)
// listens, and App closes the phone's menu drawer so the help is in front.

export const OPEN_HELP_EVENT = 'walter:open-help';

export const openHelp = () => window.dispatchEvent(new Event(OPEN_HELP_EVENT));
