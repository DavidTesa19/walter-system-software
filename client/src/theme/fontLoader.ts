// The fonts a palette can choose (FONT_SUGGESTIONS in PaletteManager.tsx),
// served from the app itself (@fontsource packages, no Google Fonts request)
// and loaded only when a palette uses them. Each loads weights 400–700 with
// the Latin Extended subset, so Czech letters render in the font itself.
//
// A font added to FONT_SUGGESTIONS needs its loader here (and its package).

type Loader = () => Promise<unknown[]>;

const LOADERS: Record<string, Loader> = {
  inter: () => Promise.all([
    import('@fontsource/inter/400.css'), import('@fontsource/inter/500.css'),
    import('@fontsource/inter/600.css'), import('@fontsource/inter/700.css'),
  ]),
  poppins: () => Promise.all([
    import('@fontsource/poppins/400.css'), import('@fontsource/poppins/500.css'),
    import('@fontsource/poppins/600.css'), import('@fontsource/poppins/700.css'),
  ]),
  manrope: () => Promise.all([
    import('@fontsource/manrope/400.css'), import('@fontsource/manrope/500.css'),
    import('@fontsource/manrope/600.css'), import('@fontsource/manrope/700.css'),
  ]),
  'nunito sans': () => Promise.all([
    import('@fontsource/nunito-sans/400.css'), import('@fontsource/nunito-sans/500.css'),
    import('@fontsource/nunito-sans/600.css'), import('@fontsource/nunito-sans/700.css'),
  ]),
  'work sans': () => Promise.all([
    import('@fontsource/work-sans/400.css'), import('@fontsource/work-sans/500.css'),
    import('@fontsource/work-sans/600.css'), import('@fontsource/work-sans/700.css'),
  ]),
  'source sans pro': () => Promise.all([
    import('@fontsource/source-sans-pro/400.css'), import('@fontsource/source-sans-pro/600.css'),
    import('@fontsource/source-sans-pro/700.css'),
  ]),
  montserrat: () => Promise.all([
    import('@fontsource/montserrat/400.css'), import('@fontsource/montserrat/500.css'),
    import('@fontsource/montserrat/600.css'), import('@fontsource/montserrat/700.css'),
  ]),
  raleway: () => Promise.all([
    import('@fontsource/raleway/400.css'), import('@fontsource/raleway/500.css'),
    import('@fontsource/raleway/600.css'), import('@fontsource/raleway/700.css'),
  ]),
};

export const LOADABLE_FONTS = Object.keys(LOADERS);

const started = new Set<string>();

/** The first family of a CSS font stack, lower case: "'Work Sans', sans-serif" → "work sans". */
export const firstFamily = (stack: string | null | undefined) =>
  String(stack ?? '').split(',')[0]?.trim().replace(/^['"]|['"]$/g, '').toLowerCase() ?? '';

/** Load the fonts these stacks start with (each family once per page). */
export function ensureFonts(stacks: Array<string | null | undefined>) {
  for (const stack of stacks) {
    const family = firstFamily(stack);
    const load = LOADERS[family];
    if (!load || started.has(family)) continue;
    started.add(family);
    load().catch(() => {
      // Offline or a failed chunk: the stack's fallbacks stand in.
      started.delete(family);
    });
  }
}
