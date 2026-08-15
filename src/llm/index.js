const providers = {
  openai: require('./providers/openai'),
};

function getProvider(name) {
  const provider = providers[name];
  if (!provider) {
    const available = Object.keys(providers).join(', ');
    throw new Error(`Provedor LLM "${name}" não encontrado. Disponíveis: ${available}`);
  }
  return provider;
}

async function generateResponse(messages, options = {}) {
  const providerName = options.provider || process.env.LLM_PROVIDER || 'openai';
  const provider = getProvider(providerName);
  return provider.generateResponse(messages, options);
}

async function* generateResponseStream(messages, options = {}) {
  const providerName = options.provider || process.env.LLM_PROVIDER || 'openai';
  const provider = getProvider(providerName);
  yield* provider.generateResponseStream(messages, options);
}

async function generateWithTools(messages, tools, options = {}) {
  const providerName = options.provider || process.env.LLM_PROVIDER || 'openai';
  const provider = getProvider(providerName);
  return provider.generateWithTools(messages, tools, options);
}

module.exports = {
  generateResponse,
  generateResponseStream,
  generateWithTools,
  getProvider,
  providers,
};
