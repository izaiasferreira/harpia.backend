const providers = {
  openai: require('./providers/openai'),
  gemini: require('./providers/gemini'),
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

module.exports = {
  generateResponse,
  getProvider,
  providers,
};
