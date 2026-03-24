import type { ToolDef } from '../types';

function truncateJson(value: unknown, depth = 0): unknown {
  if (Array.isArray(value)) {
    return value.slice(0, 2).map((item) => truncateJson(item, depth + 1));
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = truncateJson(v, depth + 1);
    }
    return result;
  }
  return value;
}

export const def: ToolDef = {
  name: 'fetch_url',
  schema: { name: 'fetch_url', description: 'Fetch the content of any URL and return the response body as text. Supports custom method, headers, and body for POST/PUT requests or curl-style requests.', input_schema: { type: 'object' as const, properties: { url: { type: 'string', description: 'The URL to fetch.' }, method: { type: 'string', description: 'HTTP method (GET, POST, PUT, PATCH, DELETE). Defaults to GET.' }, headers: { type: 'object', description: 'Request headers as key-value pairs.' }, body: { type: 'string', description: 'Request body string (for POST/PUT). Use JSON string for JSON APIs.' } }, required: ['url'] } },
  meta: { label: 'Fetch URL', description: 'Fetch content from any URL' },
  handler: async (input) => {
    const result = await new Promise<{ text?: string; status?: number; statusText?: string; error?: string }>((resolve, reject) => {
      chrome.runtime.sendMessage({ action: 'fetchUrl', url: input.url, method: input.method, headers: input.headers, body: input.body }, (response) => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(response);
      });
    });
    if (result.error) return { content: result.error, isError: true };
    let body = result.text ?? '';
    try {
      const json = JSON.parse(body);
      body = JSON.stringify(truncateJson(json), null, 2);
    } catch { /* not JSON, use as-is */ }
    if (body.length > 8000) body = body.slice(0, 8000) + '\n...[truncated]';
    return { content: `${result.status} ${result.statusText}\n${body}` };
  },
};
