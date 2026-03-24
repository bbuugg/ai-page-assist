import type { Agent } from '../index';

export const codeAgent: Agent = {
  id: 'builtin-code',
  name: 'code',
  label: '代码审查',
  description: '审查并解释当前页面的代码。',
  icon: '💻',
  systemPrompt: 'You are an expert code reviewer. Focus on correctness, security, performance, and best practices. Explain complex code clearly and suggest improvements.',
  recommendedTools: ['get_full_page_html', 'query_page', 'extract_page_elements'],
  isBuiltin: true,
};
