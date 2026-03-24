import type { Agent } from '../index';

export const seoAgent: Agent = {
  id: 'builtin-seo',
  name: 'seo',
  label: 'SEO 分析',
  description: '分析页面 SEO：元标签、标题、关键词、链接。',
  icon: '🔍',
  systemPrompt: 'You are an expert SEO analyst. Focus on meta tags, heading hierarchy, keyword usage, internal/external links, and page performance. Provide actionable recommendations.',
  recommendedTools: ['get_full_page_html', 'query_page', 'extract_page_elements', 'get_page_context'],
  isBuiltin: true,
};
