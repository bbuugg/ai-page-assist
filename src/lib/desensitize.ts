// Desensitize sensitive information in text for display
const RULES: [RegExp, string][] = [
  // Password patterns: password=xxx, "password":"xxx", password: xxx
  [/(?<=["']?(?:password|passwd|pwd|secret|token|api[_-]?key|apikey|access[_-]?key|auth)["']?\s*[:=]\s*["']?)([^"'\s,}\]]{4,})/gi, '***'],
  // Email
  [/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, (m: string) => m[0] + '***@' + m.split('@')[1]],
  // Chinese phone numbers (11 digits starting with 1)
  [/(?<![\d])(1[3-9]\d{9})(?![\d])/g, (m: string) => m.slice(0, 3) + '****' + m.slice(7)],
  // Credit card (13-19 digits)
  [/(?<![\d])(\d{4})[\s\-]?(\d{4})[\s\-]?(\d{4})[\s\-]?(\d{1,7})(?![\d])/g, '$1 **** **** ****'],
  // ID card (Chinese 18-digit)
  [/(?<![\d])(\d{6})\d{8}(\d{4})(?![\d])/g, '$1********$2'],
];

export function desensitize(text: string): string {
  let result = text;
  for (const [pattern, replacement] of RULES) {
    result = result.replace(pattern, replacement as string);
  }
  return result;
}

// Patterns for AI-layer encoding: replace with reversible placeholders
const ENCODE_RULES: [RegExp, string][] = [
  // Email
  [/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, 'EMAIL'],
  // Chinese phone numbers (11 digits starting with 1)
  [/(?<![\d])(1[3-9]\d{9})(?![\d])/g, 'PHONE'],
  // Chinese ID card (18-digit)
  [/(?<![\d])\d{6}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dX](?![\d])/gi, 'IDCARD'],
  // Password / secret field values
  [/(?<=["']?(?:password|passwd|pwd|secret|token|api[_-]?key|apikey|access[_-]?key|auth)["']?\s*[:=]\s*["']?)([^"'\s,}\]]{4,})/gi, 'SECRET'],
];

export interface Desensitizer {
  encode(text: string): string;
  decode(text: string): string;
}

export function createDesensitizer(): Desensitizer {
  const map = new Map<string, string>(); // placeholder -> original
  const reverse = new Map<string, string>(); // original -> placeholder
  const counters: Record<string, number> = {};

  function getOrCreate(type: string, original: string): string {
    if (reverse.has(original)) return reverse.get(original)!;
    counters[type] = (counters[type] ?? 0) + 1;
    const placeholder = `[${type}_${counters[type]}]`;
    map.set(placeholder, original);
    reverse.set(original, placeholder);
    return placeholder;
  }

  function encode(text: string): string {
    let result = text;
    for (const [pattern, type] of ENCODE_RULES) {
      result = result.replace(new RegExp(pattern.source, pattern.flags), (match) => getOrCreate(type, match));
    }
    return result;
  }

  function decode(text: string): string {
    let result = text;
    for (const [placeholder, original] of map) {
      result = result.split(placeholder).join(original);
    }
    return result;
  }

  return { encode, decode };
}
