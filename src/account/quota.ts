import { unwrap, type ForesignalClient } from '../api/client';
import type { components } from '../api/generated/schema';

/** The caller's effective quota and current usage (`getMyQuota`). */
export type QuotaUsage = components['schemas']['QuotaUsage'];

/** Per-user limits; a `null` member uses the instance default, unset is unlimited, `0` allows none. */
export type Quota = components['schemas']['Quota'];

/** The caller's LLM budget and spend across providers (`getMyLlmBudget`). */
export type MeLlmBudget = components['schemas']['MeLlmBudget'];

/** The caller's spend and budget on one provider. */
export type LlmBudgetProvider = components['schemas']['LlmBudgetProvider'];

/** Reads the caller's quota and usage. */
export function getMyQuota(api: ForesignalClient, signal?: AbortSignal): Promise<QuotaUsage> {
  return unwrap(api.GET('/v1/me/quota', { signal }));
}

/** Reads the caller's LLM budget and spend. */
export function getMyLlmBudget(api: ForesignalClient, signal?: AbortSignal): Promise<MeLlmBudget> {
  return unwrap(api.GET('/v1/me/llm/budget', { signal }));
}
