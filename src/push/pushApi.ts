import type { ForesignalClient } from '../api/client';
import { unwrap } from '../api/client';
import type { components } from '../api/generated/schema';

/** A registered push subscription, without its endpoint (`PushSubscription`). */
export type PushSubscriptionRecord = components['schemas']['PushSubscription'];

/** A push subscription as registered (`PushSubscriptionInput`). */
export type PushSubscriptionInput = components['schemas']['PushSubscriptionInput'];

/** A ForeSignal push message (`PushPayload`). */
export type PushPayload = components['schemas']['PushPayload'];

/** The server's VAPID public key, base64url (`getVapidPublicKey`); open, no token. */
export async function getVapidPublicKey(
  api: ForesignalClient,
  signal?: AbortSignal,
): Promise<string> {
  const key = await unwrap(api.GET('/v1/push/vapid-public-key', { signal }));
  return key.publicKey;
}

/**
 * Registers a browser subscription (`createPushSubscription`). It starts `pending`; the backend
 * sends a `verify` push whose code {@link verifyPushSubscription} echoes. Needs a token.
 */
export function createPushSubscription(
  api: ForesignalClient,
  input: PushSubscriptionInput,
): Promise<PushSubscriptionRecord> {
  return unwrap(api.POST('/v1/push/subscriptions', { body: input }));
}

/** Echoes a verification code, making the subscription active (`verifyPushSubscription`). */
export function verifyPushSubscription(
  api: ForesignalClient,
  subscriptionId: string,
  code: string,
): Promise<PushSubscriptionRecord> {
  return unwrap(
    api.POST('/v1/push/subscriptions/{subscriptionId}/verify', {
      params: { path: { subscriptionId } },
      body: { code },
    }),
  );
}

/** Every push subscription (`listPushSubscriptions`); needs `admin` scope. */
export function listPushSubscriptions(
  api: ForesignalClient,
  signal?: AbortSignal,
): Promise<PushSubscriptionRecord[]> {
  return unwrap(api.GET('/v1/push/subscriptions', { signal }));
}

/** Removes a subscription (`deletePushSubscription`); only its creating token or an admin. */
export async function deletePushSubscription(
  api: ForesignalClient,
  subscriptionId: string,
): Promise<void> {
  await unwrap(
    api.DELETE('/v1/push/subscriptions/{subscriptionId}', {
      params: { path: { subscriptionId } },
    }),
  );
}
