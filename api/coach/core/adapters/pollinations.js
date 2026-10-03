/* Free anonymous text endpoint, tested before enabling the personal preset.
 * No private developer key, paid model or alternate host is used as a fallback.
 * `private` requests exclusion from public feeds; it is not a promise of no provider logging.
 */
import { httpAdapter } from './http.js';
import { chatCompletionsSpec } from './openai.js';
import { baseUrlFor } from '../providers.js';

const plain = chatCompletionsSpec('pollinations', { maxTokensField: 'max_tokens', temperature: 0 });
export const pollinationsSpec = {
  ...plain,
  path: () => '/openai', modelsPath: '/models', headers: () => ({}),
  validateConfig: ({ cfg, model }) => baseUrlFor('pollinations', cfg) !== 'https://text.pollinations.ai'
    || model != null && model !== 'openai-fast' ? 'Built-in AI requires its fixed free endpoint and model' : null,
  // Anonymous text supports the plain completion shape. It refused structured
  // response_format; the common JSON parser and proposal validator remain the gate.
  body: opts => {
    const { response_format: _unsupported, ...body } = plain.body(opts);
    return { ...body, max_tokens: Math.min(opts.maxTokens, 4096), private: true, stream: false };
  },
  readModels: data => (Array.isArray(data) ? data : data.data || data.models || []).some(model => (typeof model === 'string' ? model : model.name || model.id) === 'openai-fast') ? ['openai-fast'] : [],
};
export default httpAdapter(pollinationsSpec);
