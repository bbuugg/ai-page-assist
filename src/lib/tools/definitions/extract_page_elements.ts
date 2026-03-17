import type { ToolDef } from '../types';
export const def: ToolDef = {
  name: 'extract_page_elements',
  schema: {
    name: 'extract_page_elements',
    description:
      'Extract elements from the live page by CSS selectors and/or keywords. ' +
      'Returns tag, id, class, text snippet, and simplified outerHTML for each match. ' +
      'Use this before resorting to get_full_page_html.',
    input_schema: {
      type: 'object' as const,
      properties: {
        selectors: {
          type: 'array',
          items: { type: 'string' },
          description: 'CSS selectors to query (e.g. ["nav", ".price", "#cart"]). Each is tried independently.',
        },
        keywords: {
          type: 'array',
          items: { type: 'string' },
          description: 'Text keywords to search for in element text content. Case-insensitive substring match.',
        },
        limit: {
          type: 'number',
          description: 'Max elements to return per selector/keyword. Default 5.',
        },
      },
      required: [],
    },
  },
  meta: { label: 'Extract Page Elements', description: 'Extract elements by selector or keyword' },
  handler: 'content',
};
