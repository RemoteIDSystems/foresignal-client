import '@testing-library/jest-dom/vitest';

// jsdom has no canvas; it logs "Not implemented" on every getContext call. Returning null is what
// a browser without WebGL does, so code under test takes its no-WebGL path quietly. Node-environment
// suites have no DOM at all, so the stub is skipped there.
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() =>
    null) as typeof HTMLCanvasElement.prototype.getContext;
}
