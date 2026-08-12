async function generateResponse(messages, options = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY não configurada');

  const model = options.model || process.env.LLM_MODEL || 'gpt-4o-mini';

  const processedMessages = messages.map(msg => {
    if (msg.attachments && msg.attachments.length > 0) {
      const contentArray = [{ type: 'text', text: msg.content }];
      for (const att of msg.attachments) {
        if (att.mimeType?.startsWith('image/')) {
          // ensure absolute url if possible
          const url = att.url.startsWith('http') ? att.url : `${process.env.PUBLIC_URL || 'http://localhost:3000'}/files/${att.url}`;
          contentArray.push({ type: 'image_url', image_url: { url } });
        }
      }
      return { role: msg.role, content: contentArray };
    }
    return { role: msg.role, content: msg.content };
  });

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: processedMessages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 16384,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${err}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

async function* generateResponseStream(messages, options = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY não configurada');

  const model = options.model || process.env.LLM_MODEL || 'gpt-4o-mini';
  const signal = options.signal;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 16384,
    }),
    signal,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${err}`);
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
      if (data === '[DONE]') continue;
      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices?.[0]?.delta?.content || '';
        if (content) yield content;
      } catch (e) {}
    }
  }
}

async function generateWithTools(messages, tools, options = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY não configurada');

  const model = options.model || process.env.LLM_MODEL || 'gpt-4o-mini';
  const signal = options.signal;

  const body = {
    model,
    messages,
    temperature: options.temperature ?? 0.5,
    max_tokens: options.maxTokens ?? 16384,
  };

  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${err}`);
  }

  const data = await response.json();
  const choice = data.choices[0];

  return {
    content: choice.message.content || '',
    toolCalls: choice.message.tool_calls || null,
  };
}

module.exports = { generateResponse, generateResponseStream, generateWithTools };
