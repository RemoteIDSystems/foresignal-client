/// <reference types="vite/client" />

/** Build-time environment variables read by the client. */
interface ImportMetaEnv {
  /** Backend base URL; defaults to `/` (same-origin). */
  readonly VITE_FORESIGNAL_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** This build's version, from `package.json`. */
declare const __APP_VERSION__: string;

/** This build's runtime dependencies and their exact versions, from `package.json`. */
declare const __APP_DEPENDENCIES__: Record<string, string>;
