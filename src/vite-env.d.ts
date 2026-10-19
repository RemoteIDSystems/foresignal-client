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
