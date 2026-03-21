import type { ToolDef } from '../types';
export const def: ToolDef = {
  name: 'query_page',
  schema: { name: 'query_page', description: 'Query the page for elements matching a CSS selector or containing specific text, returning a summary of matches.', input_schema: { type: 'object' as const, properties: { selector: { type: 'string', description: 'CSS selector to query.' }, text: { type: 'string', description: 'Optional text to filter elements by.' }, limit: { type: 'number', description: 'Maximum number of results to return. Default 20.' } }, required: ['selector'] } },
  meta: { label: 'Query Page', description: 'Query page elements by CSS selector or keyword' },
  handler: 'content',
};
