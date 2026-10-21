import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { OPEN_MESSAGE } from './webPush';

/** The app route for a path the service worker gives, which starts with the app's base. */
export function routeOf(path: string, base: string = import.meta.env.BASE_URL): string {
  return path.startsWith(base) ? `/${path.slice(base.length)}` : path;
}

/**
 * Opens what a link names (030): `?open=<ref>` in the URL (a notification that opened a new page)
 * is handed to `openObject` once, and a notification activated while a page is open (the service
 * worker's {@link OPEN_MESSAGE}) moves that page to the notification's route.
 */
export function useDeepLinks(
  openObject: (ref: string) => void,
  container: ServiceWorkerContainer | undefined = typeof navigator !== 'undefined'
    ? navigator.serviceWorker
    : undefined,
): void {
  const location = useLocation();
  const navigate = useNavigate();
  const opened = useRef<string | undefined>(undefined);
  const ref = new URLSearchParams(location.search).get('open') ?? undefined;
  useEffect(() => {
    if (!ref || opened.current === `${location.key}:${ref}`) return;
    opened.current = `${location.key}:${ref}`;
    openObject(ref);
  }, [ref, location.key, openObject]);
  useEffect(() => {
    if (!container) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; path?: string };
      if (data?.type === OPEN_MESSAGE && typeof data.path === 'string') {
        void navigate(routeOf(data.path));
      }
    };
    container.addEventListener('message', onMessage);
    return () => container.removeEventListener('message', onMessage);
  }, [container, navigate]);
}
