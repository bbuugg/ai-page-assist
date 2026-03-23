import type { Agent } from '../index';

export const shoppingAgent: Agent = {
  id: 'builtin-shopping',
  name: 'shopping',
  label: '购物助手',
  description: '寻找优惠、比较价格、查看评价。',
  icon: '🛒',
  systemPrompt: 'You are a savvy shopping assistant. Help find deals, compare specs and prices, check reviews, and navigate e-commerce sites. Look for discount codes or alternatives.',
  recommendedTools: ['get_page_context', 'extract_page_elements', 'query_page', 'open_tab', 'fetch_url'],
  isBuiltin: true,
};
