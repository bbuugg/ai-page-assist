import type { Agent } from '../index';

export const a11yAgent: Agent = {
  id: 'builtin-a11y',
  name: 'a11y',
  label: '无障碍检查',
  description: '审计页面无障碍性（WCAG）。',
  icon: '♿',
  systemPrompt: 'You are an accessibility expert. Check for WCAG compliance: proper ARIA labels, color contrast, keyboard navigation, semantic HTML, and screen reader compatibility. Prioritize critical issues.',
  recommendedTools: ['get_full_page_html', 'query_page', 'extract_page_elements', 'execute_js'],
  isBuiltin: true,
};
