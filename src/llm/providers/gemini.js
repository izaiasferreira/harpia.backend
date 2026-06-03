function convertToGeminiMessages(messages) {
  const contents = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      contents.push({ role: 'user', parts: [{ text: `[System]: ${msg.content}` }] });
      continue;
    }

    const role = msg.role === 'assistant' ? 'model' : 'user';

    if (msg.role === 'assistant') {
      const parts = [];
      if (msg.content) parts.push({ text: msg.content });
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          parts.push({
            functionCall: {
              name: tc.function.name,
              args: typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function.arguments,
            },
          });
        }
      }
      contents.push({ role: 'model', parts });
      continue;
    }

    if (msg.role === 'tool') {
      contents.push({
        role: 'user',
        parts: [{
          functionResponse: {
            name: msg.name || 'unknown',
            response: typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content,
          },
        }],
      });
      continue;
    }

    if (Array.isArray(msg.parts)) {
      contents.push({ role, parts: msg.parts });
      continue;
    }

    contents.push({ role, parts: [{ text: msg.content || '' }] });
  }

  return contents;
}

function convertToOpenAITools(tools) {
  if (!tools || tools.length === 0) return undefined;
  return tools.map(t => ({
    functionDeclarations: [{
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters,
    }],
  }));
}

async function generateResponse(messages, options = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY não configurada');

  const model = options.model || process.env.LLM_MODEL || 'gemini-2.0-flash';

  const contents = convertToGeminiMessages(messages);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: options.temperature ?? 0.7,
          maxOutputTokens: options.maxTokens ?? 16384,
        },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error: ${response.status} ${err}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join('') || '';
}

async function* generateResponseStream(messages, options = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY não configurada');

  const model = options.model || process.env.LLM_MODEL || 'gemini-2.0-flash';
  const signal = options.signal;

  const contents = convertToGeminiMessages(messages);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: options.temperature ?? 0.7,
          maxOutputTokens: options.maxTokens ?? 16384,
        },
      }),
      signal,
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error: ${response.status} ${err}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);
      if (!data || data === '[DONE]') continue;
      try {
        const parsed = JSON.parse(data);
        const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (text) yield text;
      } catch (e) {}
    }
  }
}

async function generateWithTools(messages, tools, options = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY não configurada');

  const model = options.model || process.env.LLM_MODEL || 'gemini-2.0-flash';
  const signal = options.signal;

  const contents = convertToGeminiMessages(messages);
  const body = {
    contents,
    generationConfig: {
      temperature: options.temperature ?? 0.5,
      maxOutputTokens: options.maxTokens ?? 16384,
    },
  };

  const geminiTools = convertToOpenAITools(tools);
  if (geminiTools) body.tools = geminiTools;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error: ${response.status} ${err}`);
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];
  if (!candidate) return { content: '', toolCalls: null };

  const parts = candidate.content?.parts || [];

  const functionCalls = parts.filter(p => p.functionCall);
  if (functionCalls.length > 0) {
    const toolCalls = functionCalls.map((part, i) => ({
      id: `${part.functionCall.name}_${i}`,
      type: 'function',
      function: {
        name: part.functionCall.name,
        arguments: JSON.stringify(part.functionCall.args || {}),
      },
    }));

    const textParts = parts.filter(p => p.text);
    const content = textParts.map(p => p.text).join('');

    return { content, toolCalls };
  }

  const text = parts.map(p => p.text).filter(Boolean).join('');
  return { content: text, toolCalls: null };
}

module.exports = { generateResponse, generateResponseStream, generateWithTools };
