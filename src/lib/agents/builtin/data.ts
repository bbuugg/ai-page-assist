import type { Agent } from '../index';

export const dataAgent: Agent = {
  id: 'builtin-data',
  name: 'data',
  label: '数据提取',
  description: '从页面中提取结构化数据。',
  icon: '📊',
  systemPrompt: 'You are a data extraction specialist. Identify and extract structured data (tables, lists, prices, contacts). Present data in clean, structured formats like JSON or markdown tables.',
  recommendedTools: ['get_full_page_html', 'query_page', 'extract_page_elements', 'execute_js'],
  isBuiltin: true,
};
