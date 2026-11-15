/**
 * Global unit-test setup (jsdom).
 *
 * jsdom does not implement a few browser APIs that our Spartan Brain based
 * components legitimately use while positioning overlays and measuring their
 * host: `ResizeObserver` and `matchMedia`. Without them the failure is a
 * `ReferenceError` inside Angular's afterRender hook, which surfaces as an
 * unrelated assertion failure in whichever spec happens to mount the overlay.
 *
 * These are inert stand-ins for a headless DOM: they never affect production,
 * they observe nothing, and they report the desktop defaults the components
 * expect. Layout is not validated in jsdom either way.
 */
class InertResizeObserver implements ResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (!("ResizeObserver" in globalThis)) {
  Object.defineProperty(globalThis, "ResizeObserver", {
    value: InertResizeObserver,
    configurable: true,
    writable: true
  })
}

if (typeof globalThis.matchMedia !== "function") {
  Object.defineProperty(globalThis, "matchMedia", {
    value: (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false
      }) as MediaQueryList,
    configurable: true,
    writable: true
  })
}
