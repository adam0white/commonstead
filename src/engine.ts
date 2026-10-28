/** Match replay and passport metadata to the installed public package. */
import framework from '@adam0white/human-framework/package.json' with { type: 'json' };

export const FRAMEWORK_VERSION = framework.version;
