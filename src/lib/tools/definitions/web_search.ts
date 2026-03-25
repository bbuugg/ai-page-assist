import type { ToolDef } from '../types';
import { loadSearchConfig } from '../../storage';

async function fetchViaBackground(url: string, headers: Record<string, string>): Promise<{ text?: string; error?: string }> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: 'fetchUrl', url, headers }, (res) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(res);
    });
  });
}

function truncate(s: string, max: number) {
  return s.length > max ? s.slice(0, max) + '\u2026' : s;
}

export const def: ToolDef = {
  name: 'web_search',
  schema: {
    name: 'web_search',
    description: 'Search the web and return a list of results (title, url, snippet). Use this to find up-to-date information.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'The search query.' },
        num_results: { type: 'number', description: 'Number of results to return (1-10). Defaults to 5.' },
      },
      required: ['query'],
    },
  },
  meta: { label: 'Web Search', description: 'Search the web for information' },
  handler: async (input) => {
    const config = await loadSearchConfig();
    const query = String(input.query ?? '');
    const n = Math.min(10, Math.max(1, Number(input.num_results ?? 5)));

    if (!query) return { content: 'query is required', isError: true };

    try {
      if (config.engine === 'searxng') {
        if (!config.searxngUrl) return { content: 'SearXNG URL not configured. Please set it in Settings \u2192 \u641c\u7d22.', isError: true };
        const url = `${config.searxngUrl.replace(/\/$/, '')}/search?q=${encodeURIComponent(query)}&format=json&engines=general&pageno=1`;
        const res = await fetchViaBackground(url, { 'Accept': 'application/json' });
        if (res.error) return { content: res.error, isError: true };
        const json = JSON.parse(res.text ?? '{}');
        const results = (json.results ?? []).slice(0, n).map((r: { title?: string; url?: string; content?: string }) => ({
          title: truncate(r.title ?? '', 120),
          url: r.url ?? '',
          snippet: truncate(r.content ?? '', 300),
        }));
        return { content: JSON.stringify(results, null, 2) };
      }

      if (config.engine === 'brave') {
        if (!config.braveApiKey) return { content: 'Brave API key not configured. Please set it in Settings \u2192 \u641c\u7d22.', isError: true };
        const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${n}`;
        const res = await fetchViaBackground(url, { 'Accept': 'application/json', 'X-Subscription-Token': config.braveApiKey });
        if (res.error) return { content: res.error, isError: true };
        const json = JSON.parse(res.text ?? '{}');
        const results = (json.web?.results ?? []).slice(0, n).map((r: { title?: string; url?: string; description?: string }) => ({
          title: truncate(r.title ?? '', 120),
          url: r.url ?? '',
          snippet: truncate(r.description ?? '', 300),
        }));
        return { content: JSON.stringify(results, null, 2) };
      }

      if (config.engine === 'google') {
        if (!config.googleApiKey || !config.googleCx) return { content: 'Google API key or CX not configured. Please set them in Settings \u2192 \u641c\u7d22.', isError: true };
        const url = `https://www.googleapis.com/customsearch/v1?key=${config.googleApiKey}&cx=${config.googleCx}&q=${encodeURIComponent(query)}&num=${n}`;
        const res = await fetchViaBackground(url, { 'Accept': 'application/json' });
        if (res.error) return { content: res.error, isError: true };
        const json = JSON.parse(res.text ?? '{}');
        const results = (json.items ?? []).slice(0, n).map((r: { title?: string; link?: string; snippet?: string }) => ({
          title: truncate(r.title ?? '', 120),
          url: r.link ?? '',
          snippet: truncate(r.snippet ?? '', 300),
        }));
        return { content: JSON.stringify(results, null, 2) };
      }

      return { content: `Unknown search engine: ${config.engine}`, isError: true };
    } catch (err) {
      return { content: (err as Error).message, isError: true };
    }
  },
};
