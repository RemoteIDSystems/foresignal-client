import { unwrap, type ForesignalClient } from '../api/client';
import type { components } from '../api/generated/schema';

/**
 * The fitted calibration of one intel scope (`IntelCalibration`): the CORP recalibration curve, the
 * 10-bin reliability table and the Brier score over resolved outcomes. Read-only here (gated
 * `intel.read`); the tunable corroboration policy is an operator setting, not touched by this client.
 */
export type IntelCalibration = components['schemas']['IntelCalibration'];

/** The intel scopes the calibration covers. */
export type IntelScope = IntelCalibration['scope'];

/** The corroboration policy (`IntelCorroboration`): the gates that promote evidence to a signal. */
export type IntelCorroboration = components['schemas']['IntelCorroboration'];

/** The calibration overview across scopes (`getIntelCalibration`). */
export async function getIntelCalibration(
  api: ForesignalClient,
  signal?: AbortSignal,
): Promise<IntelCalibration[]> {
  const overview = await unwrap(api.GET('/v1/intel/calibration', { signal }));
  return overview.scopes;
}

/** The calibration of one scope (`getIntelCalibrationScope`). */
export function getIntelCalibrationScope(
  api: ForesignalClient,
  scope: IntelScope,
  signal?: AbortSignal,
): Promise<IntelCalibration> {
  return unwrap(api.GET('/v1/intel/calibration/{scope}', { params: { path: { scope } }, signal }));
}

/** The current corroboration policy (`getIntelCorroboration`), read-only in this client. */
export function getIntelCorroboration(
  api: ForesignalClient,
  signal?: AbortSignal,
): Promise<IntelCorroboration> {
  return unwrap(api.GET('/v1/intel/corroboration', { signal }));
}
