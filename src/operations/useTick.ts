import { useEffect, useState } from 'react';

/**
 * A count that goes up every `everyMs` while the component is shown, for reads that should be made
 * again on a schedule (pass it as `useRead`'s version).
 */
export function useTick(everyMs: number): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((current) => current + 1), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return tick;
}
