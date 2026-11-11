// While the app is zoomed (CSS `zoom` on <html>, see appZoom.ts), make the
// page's coordinate APIs answer in the zoomed page's own CSS pixels — the way
// they answer under the browser's own Ctrl+/− zoom.
//
// Why: with CSS zoom, getBoundingClientRect(), mouse clientX/Y and
// innerWidth/innerHeight report screen pixels, but a `top: 120px` written from
// them is zoomed again. Every popup placed next to what it belongs to (our
// pickers, ag-Grid's cell editors and menus, FullCalendar's "+N more") then
// opens off by the zoom factor (measured 2026-11-11: a status editor meant for
// (989, 243) opened at (1236, 303) at 125 %). Correcting all of them in one
// place keeps the libraries untouched.
//
// At 100 % every patched API returns the native value unchanged, so a user
// who never zooms runs exactly the browser's own code paths.

let zoom = 1;

export const setShimZoom = (value: number) => {
  zoom = value > 0 ? value : 1;
};

const scaled = (rect: DOMRect) =>
  zoom === 1 ? rect : new DOMRect(rect.x / zoom, rect.y / zoom, rect.width / zoom, rect.height / zoom);

let installed = false;

export function installCoordinateShim() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  // Element and Range rectangles.
  for (const proto of [Element.prototype, Range.prototype] as Array<{ getBoundingClientRect: () => DOMRect; getClientRects: () => DOMRectList }>) {
    const nativeRect = proto.getBoundingClientRect;
    const nativeRects = proto.getClientRects;
    proto.getBoundingClientRect = function getBoundingClientRect(this: Element | Range) {
      return scaled(nativeRect.call(this));
    };
    proto.getClientRects = function getClientRects(this: Element | Range) {
      const rects = nativeRects.call(this);
      if (zoom === 1) return rects;
      return Array.from(rects, scaled) as unknown as DOMRectList;
    };
  }

  // Pointer, mouse and touch positions.
  const patchGetters = (proto: object, names: string[]) => {
    for (const name of names) {
      const descriptor = Object.getOwnPropertyDescriptor(proto, name);
      const get = descriptor?.get;
      if (!get) continue;
      Object.defineProperty(proto, name, {
        configurable: true,
        enumerable: descriptor.enumerable,
        get(this: unknown) {
          const value = get.call(this) as number;
          return zoom === 1 ? value : value / zoom;
        },
      });
    }
  };
  patchGetters(MouseEvent.prototype, ['clientX', 'clientY', 'pageX', 'pageY', 'x', 'y', 'movementX', 'movementY']);
  if (typeof Touch !== 'undefined') patchGetters(Touch.prototype, ['clientX', 'clientY', 'pageX', 'pageY']);

  // The window's size, which popups compare against to flip up or left.
  for (const name of ['innerWidth', 'innerHeight'] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(window, name) ?? Object.getOwnPropertyDescriptor(Window.prototype, name);
    const get = descriptor?.get;
    if (!get) continue;
    Object.defineProperty(window, name, {
      configurable: true,
      get() {
        const value = get.call(window) as number;
        return zoom === 1 ? value : value / zoom;
      },
    });
  }

  // Hit-testing takes the (now zoom-free) coordinates back to screen pixels.
  const nativeFromPoint = Document.prototype.elementFromPoint;
  const nativeFromPoints = Document.prototype.elementsFromPoint;
  Document.prototype.elementFromPoint = function elementFromPoint(this: Document, x: number, y: number) {
    return nativeFromPoint.call(this, x * zoom, y * zoom);
  };
  Document.prototype.elementsFromPoint = function elementsFromPoint(this: Document, x: number, y: number) {
    return nativeFromPoints.call(this, x * zoom, y * zoom);
  };
}
