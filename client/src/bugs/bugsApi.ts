// Hlášení chyb: bug reports with screenshots (server/bugs/).

import { apiDelete, apiGet, apiGetBlob, apiPatch, apiUpload } from '../utils/api';

export type BugSeverity = 'low' | 'medium' | 'high' | 'critical';
export type BugStatus = 'new' | 'in_progress' | 'resolved' | 'wont_fix';

export interface BugScreenshot {
  id: number;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export interface BugReport {
  id: number;
  title: string;
  description: string | null;
  severity: BugSeverity;
  status: BugStatus;
  reporterUserId: number | null;
  reporterName: string | null;
  viewId: string | null;
  viewLabel: string | null;
  pageUrl: string | null;
  userAgent: string | null;
  viewport: string | null;
  resolutionNote: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  screenshots: BugScreenshot[];
}

export const SEVERITIES: Array<{ id: BugSeverity; label: string; hint: string }> = [
  { id: 'low', label: 'Nízká', hint: 'Kosmetická vada, překlep, drobnost' },
  { id: 'medium', label: 'Střední', hint: 'Něco nefunguje, ale dá se to obejít' },
  { id: 'high', label: 'Vysoká', hint: 'Důležitá funkce nefunguje' },
  { id: 'critical', label: 'Kritická', hint: 'Aplikaci nejde používat, nebo se ztrácejí data' },
];

export const SEVERITY_LABELS: Record<BugSeverity, string> = Object.fromEntries(
  SEVERITIES.map((item) => [item.id, item.label])
) as Record<BugSeverity, string>;

export const STATUS_LABELS: Record<BugStatus, string> = {
  new: 'Nové',
  in_progress: 'Řeší se',
  resolved: 'Vyřešeno',
  wont_fix: 'Nebude se řešit',
};

export const MAX_SCREENSHOTS = 6;

// The section reloads when the floating button sends a report.
const BUGS_CHANGED_EVENT = 'walter:bugs-changed';
export const onBugsChanged = (handler: () => void) => {
  window.addEventListener(BUGS_CHANGED_EVENT, handler);
  return () => window.removeEventListener(BUGS_CHANGED_EVENT, handler);
};

export interface NewBugReport {
  title: string;
  description: string;
  severity: BugSeverity;
  viewId: string;
  viewLabel: string;
  screenshots: File[];
}

export const bugsApi = {
  list: () => apiGet<{ reports: BugReport[]; canTriage: boolean }>('/api/bug-reports'),
  create: async (input: NewBugReport) => {
    const form = new FormData();
    form.append('title', input.title);
    form.append('description', input.description);
    form.append('severity', input.severity);
    form.append('viewId', input.viewId);
    form.append('viewLabel', input.viewLabel);
    form.append('pageUrl', window.location.href);
    form.append('viewport', `${window.innerWidth}×${window.innerHeight}`);
    input.screenshots.forEach((file) => form.append('screenshots', file, file.name));
    const report = await apiUpload<BugReport>('/api/bug-reports', form);
    window.dispatchEvent(new Event(BUGS_CHANGED_EVENT));
    return report;
  },
  update: (id: number, input: Partial<Pick<BugReport, 'title' | 'description' | 'severity' | 'status' | 'resolutionNote'>>) =>
    apiPatch<BugReport>(`/api/bug-reports/${id}`, input),
  remove: (id: number) => apiDelete(`/api/bug-reports/${id}`),
  screenshot: (reportId: number, screenshotId: number) => apiGetBlob(`/api/bug-reports/${reportId}/screenshots/${screenshotId}`),
};

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * A picture of the app as it is now. The browser asks which tab or screen to
 * share (Chrome offers this tab first); one frame is taken and sharing stops.
 */
export async function captureScreen(): Promise<File> {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error('Tento prohlížeč neumí pořídit snímek obrazovky. Vložte ho prosím přes Ctrl+V nebo jako soubor.');
  }
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { displaySurface: 'browser' },
    audio: false,
    // Chrome: offer the current tab first. Not in the TS DOM types yet.
    ...({ preferCurrentTab: true, selfBrowserSurface: 'include' } as object),
  } as DisplayMediaStreamOptions);
  try {
    const video = document.createElement('video');
    video.muted = true;
    video.srcObject = stream;
    await video.play();
    // The first frames can still show the browser's "choose what to share" UI
    // fading out; give it a moment.
    await new Promise((resolve) => setTimeout(resolve, 350));
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    video.pause();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Snímek se nepodařilo vytvořit.');
    const now = new Date();
    const stamp = [now.getHours(), now.getMinutes(), now.getSeconds()].map((value) => String(value).padStart(2, '0')).join('');
    return new File([blob], `obrazovka-${stamp}.png`, { type: 'image/png' });
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }
}
