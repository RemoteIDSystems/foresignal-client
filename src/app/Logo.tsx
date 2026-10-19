/** The ForeSignal mark: a split triangle, drawn inline so it needs no asset request. */
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="fs-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5cc6ff" />
          <stop offset="1" stopColor="#1e6fd8" />
        </linearGradient>
      </defs>
      <path d="M16 3 L30 28 H2 Z" fill="url(#fs-logo)" />
      <path d="M16 13 L22.5 25 H9.5 Z" fill="#020a12" />
      <path d="M16 18 L19 23.5 H13 Z" fill="#7fd4ff" />
    </svg>
  );
}
