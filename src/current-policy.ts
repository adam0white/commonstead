import { FRAMEWORK_VERSION } from './engine';
import { PRESSURE } from './pressure';

/** One host policy, with two physical scenarios. This is not a save migration. */
export const CURRENT_SCHEMA = 14;
export const CURRENT_POLICY = 'commonstead-current/2';
export const SETTLEMENT_EDITION = 'settlement-replies/2';
export const KEEP_OR_START_FRESH =
  'This saved game uses an unsupported Commonstead history and cannot replay under the current policy. The file was not loaded. Keep the original file and start a fresh game.';

export function requireCurrentScenario(config: unknown, rules: unknown) {
  if (
    config === undefined
      ? rules !== undefined && rules !== PRESSURE
      : !config ||
        typeof config !== 'object' ||
        Object.keys(config).length !== 1 ||
        !('edition' in config) ||
        config.edition !== SETTLEMENT_EDITION ||
        rules !== undefined
  )
    throw new Error(KEEP_OR_START_FRESH);
}

/** Check before worker admission or reconstruction. Old same-HF envelopes stay old. */
export function requireCurrentRun(raw: unknown): asserts raw is Record<string, unknown> {
  if (
    !raw ||
    typeof raw !== 'object' ||
    !('schema' in raw) ||
    raw.schema !== CURRENT_SCHEMA ||
    !('policy' in raw) ||
    raw.policy !== CURRENT_POLICY ||
    !('framework' in raw) ||
    raw.framework !== FRAMEWORK_VERSION ||
    !('hf' in raw) ||
    !('config' in raw) ||
    !('rules' in raw)
  )
    throw new Error(KEEP_OR_START_FRESH);
  requireCurrentScenario(
    raw.config === null ? undefined : raw.config,
    raw.rules === null ? undefined : raw.rules,
  );
  if (raw.config === null ? raw.rules !== PRESSURE : raw.rules !== null) throw new Error(KEEP_OR_START_FRESH);
}
