export function resolveElement(selector: string): Element | null {
  if (typeof selector !== 'string') return null;
  return querySelectorDeep(selector);
}

export function isElementVisible(el: Element): boolean {
  const style = window.getComputedStyle(el);
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0' &&
    (el as HTMLElement).offsetWidth > 0 &&
    (el as HTMLElement).offsetHeight > 0
  );
}

export function isModalLikeElement(el: Element): boolean {
  const role = (el.getAttribute('role') ?? '').toLowerCase();
  const id = (el.id ?? '').toLowerCase();
  const className = typeof (el as HTMLElement).className === 'string'
    ? (el as HTMLElement).className.toLowerCase()
    : '';
  const ariaModal = (el.getAttribute('aria-modal') ?? '').toLowerCase() === 'true';
  const dataState = (el.getAttribute('data-state') ?? '').toLowerCase();

  return (
    el.tagName.toLowerCase() === 'dialog' ||
    ['dialog', 'alertdialog', 'modal'].includes(role) ||
    ariaModal ||
    (el instanceof HTMLDialogElement && el.open) ||
    dataState === 'open' ||
    className.includes('modal') ||
    className.includes('dialog') ||
    className.includes('popover') ||
    className.includes('drawer') ||
    id.includes('modal') ||
    id.includes('dialog') ||
    id.includes('popover') ||
    id.includes('drawer')
  );
}

function parseZIndex(el: Element): number {
  const zIndex = window.getComputedStyle(el).zIndex;
  if (zIndex === 'auto') return 0;
  const parsed = Number.parseInt(zIndex, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getViewportIntersectionArea(rect: DOMRect): number {
  const left = Math.max(0, rect.left);
  const top = Math.max(0, rect.top);
  const right = Math.min(window.innerWidth, rect.right);
  const bottom = Math.min(window.innerHeight, rect.bottom);
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

function isTopLayerCandidate(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (!isElementVisible(el) && !isModalLikeElement(el)) return false;
  const style = window.getComputedStyle(el);
  if (style.pointerEvents === 'none') return false;
  const rect = el.getBoundingClientRect();
  const area = getViewportIntersectionArea(rect);
  if (area < 24 * 24 && !isModalLikeElement(el)) return false;

  const position = style.position;
  const centered =
    rect.left <= window.innerWidth * 0.25 &&
    rect.right >= window.innerWidth * 0.75 &&
    rect.top <= window.innerHeight * 0.25 &&
    rect.bottom >= window.innerHeight * 0.75;

  return (
    isModalLikeElement(el) ||
    position === 'fixed' ||
    position === 'sticky' ||
    (position === 'absolute' && parseZIndex(el) > 0) ||
    centered
  );
}

function scoreTopLayerElement(el: Element): number {
  const rect = el.getBoundingClientRect();
  const area = getViewportIntersectionArea(rect);
  const z = parseZIndex(el);
  const modalBonus = isModalLikeElement(el) ? 1000000 : 0;
  const centeredBonus = rect.left <= window.innerWidth * 0.35 &&
    rect.right >= window.innerWidth * 0.65 &&
    rect.top <= window.innerHeight * 0.35 &&
    rect.bottom >= window.innerHeight * 0.65
    ? 100000
    : 0;
  return modalBonus + centeredBonus + z * 1000 + area;
}

export function findClosestTopLayerContainer(el: Element | null): Element | null {
  let current: Element | null = el;
  let best: Element | null = null;

  while (current) {
    if (isTopLayerCandidate(current)) {
      if (!best || scoreTopLayerElement(current) >= scoreTopLayerElement(best)) {
        best = current;
      }
      if (isModalLikeElement(current)) return current;
    }
    current = current.parentElement;
  }

  return best;
}

export function findTopLayerElements(limit = 5): Element[] {
  const seen = new Set<Element>();
  const candidates: Element[] = [];
  const samplePoints = [
    [window.innerWidth / 2, window.innerHeight / 2],
    [window.innerWidth / 2, window.innerHeight * 0.2],
    [window.innerWidth / 2, window.innerHeight * 0.8],
    [window.innerWidth * 0.2, window.innerHeight / 2],
    [window.innerWidth * 0.8, window.innerHeight / 2],
  ];

  for (const [x, y] of samplePoints) {
    const hit = document.elementFromPoint(Math.round(x), Math.round(y));
    const container = findClosestTopLayerContainer(hit);
    if (container && !seen.has(container)) {
      seen.add(container);
      candidates.push(container);
    }
  }

  for (const el of collectElementsDeep()) {
    if (!isTopLayerCandidate(el) || seen.has(el)) continue;
    seen.add(el);
    candidates.push(el);
  }

  return candidates
    .sort((a, b) => scoreTopLayerElement(b) - scoreTopLayerElement(a))
    .slice(0, limit);
}

export function collectRoots(root: ParentNode = document): ParentNode[] {
  const roots: ParentNode[] = [root];
  const seen = new Set<ParentNode>(roots);
  const queue: ParentNode[] = [root];

  while (queue.length) {
    const current = queue.shift()!;
    const walkerRoot = current instanceof Document ? current.documentElement : current;
    if (!walkerRoot) continue;
    const walker = document.createTreeWalker(walkerRoot, NodeFilter.SHOW_ELEMENT);
    let node = walker.nextNode();
    while (node) {
      const el = node as Element;
      if (el.shadowRoot && !seen.has(el.shadowRoot)) {
        seen.add(el.shadowRoot);
        roots.push(el.shadowRoot);
        queue.push(el.shadowRoot);
      }
      node = walker.nextNode();
    }
  }

  return roots;
}

export function querySelectorDeep(selector: string): Element | null {
  for (const root of collectRoots()) {
    if ('querySelector' in root) {
      const match = root.querySelector(selector);
      if (match) return match;
    }
  }
  return null;
}

export function querySelectorAllDeep(selector: string): Element[] {
  const results: Element[] = [];
  const seen = new Set<Element>();
  for (const root of collectRoots()) {
    if (!('querySelectorAll' in root)) continue;
    for (const match of Array.from(root.querySelectorAll(selector))) {
      if (!seen.has(match)) {
        seen.add(match);
        results.push(match);
      }
    }
  }
  return results;
}

export function collectElementsDeep(root: ParentNode = document): Element[] {
  const elements: Element[] = [];
  for (const currentRoot of collectRoots(root)) {
    const walkerRoot = currentRoot instanceof Document ? currentRoot.documentElement : currentRoot;
    if (!walkerRoot) continue;
    const walker = document.createTreeWalker(walkerRoot, NodeFilter.SHOW_ELEMENT);
    let node = walker.nextNode();
    while (node) {
      elements.push(node as Element);
      node = walker.nextNode();
    }
  }
  return elements;
}

export function ensureElementInViewport(el: Element): Promise<void> {
  return new Promise((resolve) => {
    const rect = el.getBoundingClientRect();
    const margin = 12;
    const isOutsideViewport =
      rect.bottom < margin ||
      rect.top > window.innerHeight - margin ||
      rect.right < margin ||
      rect.left > window.innerWidth - margin;

    if (!isOutsideViewport) {
      resolve();
      return;
    }

    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' });
    requestAnimationFrame(() => resolve());
  });
}

function clampClientPoint(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.round(Math.min(Math.max(x, 1), Math.max(window.innerWidth - 1, 1))),
    y: Math.round(Math.min(Math.max(y, 1), Math.max(window.innerHeight - 1, 1))),
  };
}

function getHitElement(el: Element, x: number, y: number): Element | null {
  const root = el.getRootNode();
  if ('elementFromPoint' in root && typeof root.elementFromPoint === 'function') {
    return root.elementFromPoint(x, y);
  }
  return document.elementFromPoint(x, y);
}

function isPointOnElement(el: Element, x: number, y: number): boolean {
  const hit = getHitElement(el, x, y);
  return !!hit && (hit === el || el.contains(hit));
}

export function getElementClientPoint(el: Element): { x: number; y: number } {
  const rects = Array.from(el.getClientRects())
    .filter((rect) => rect.width > 0 && rect.height > 0)
    .map((rect) => ({
      left: Math.max(rect.left, 0),
      top: Math.max(rect.top, 0),
      right: Math.min(rect.right, window.innerWidth),
      bottom: Math.min(rect.bottom, window.innerHeight),
    }))
    .filter((rect) => rect.right > rect.left && rect.bottom > rect.top)
    .sort((a, b) => ((b.right - b.left) * (b.bottom - b.top)) - ((a.right - a.left) * (a.bottom - a.top)));

  const fallbackRect = el.getBoundingClientRect();
  const visibleRects = rects.length > 0
    ? rects
    : [{
      left: Math.max(fallbackRect.left, 0),
      top: Math.max(fallbackRect.top, 0),
      right: Math.min(fallbackRect.right, window.innerWidth),
      bottom: Math.min(fallbackRect.bottom, window.innerHeight),
    }];

  const candidatePoints = visibleRects.flatMap((rect) => {
    const width = rect.right - rect.left;
    const height = rect.bottom - rect.top;
    const insetX = Math.min(8, Math.max(width / 4, 1));
    const insetY = Math.min(8, Math.max(height / 4, 1));
    return [
      { x: rect.left + width / 2, y: rect.top + height / 2 },
      { x: rect.left + insetX, y: rect.top + insetY },
      { x: rect.right - insetX, y: rect.top + insetY },
      { x: rect.left + insetX, y: rect.bottom - insetY },
      { x: rect.right - insetX, y: rect.bottom - insetY },
      { x: rect.left + width / 2, y: rect.top + insetY },
      { x: rect.left + width / 2, y: rect.bottom - insetY },
    ].map((point) => clampClientPoint(point.x, point.y));
  });

  const seen = new Set<string>();
  for (const point of candidatePoints) {
    const key = `${point.x},${point.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (isPointOnElement(el, point.x, point.y)) return point;
  }

  return clampClientPoint(
    fallbackRect.left + fallbackRect.width / 2,
    fallbackRect.top + fallbackRect.height / 2,
  );
}

export function getSimplifiedHTML(root: Element, maxLength = 20000): string {
  const tab = '  ';
  let formatted = '';
  let totalChars = 0;

  const allowedAttrs = new Set(['id', 'class', 'name', 'type', 'value', 'placeholder', 'aria-label', 'role', 'href', 'title']);
  const skipTags = new Set(['script', 'style', 'svg', 'noscript', 'template', 'canvas', 'iframe', 'head', 'meta', 'link']);

  function serialize(node: Node, depth: number) {
    if (totalChars > maxLength) return;

    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      if (text) {
        const truncated = text.length > 500 ? text.slice(0, 500) + '...' : text;
        formatted += truncated;
        totalChars += truncated.length;
      }
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    if (skipTags.has(tag)) {
      const placeholderTags = new Set(['svg', 'canvas', 'iframe', 'template']);
      if (placeholderTags.has(tag)) {
        const indent = tab.repeat(depth);
        const idAttr = el.id ? ` id="${el.id}"` : '';
        const classAttr = el.className ? ` class="${el.className}"` : '';
        const placeholder = `<${tag}${idAttr}${classAttr} />`;
        if (formatted.length > 0 && !formatted.endsWith('\n')) formatted += '\n';
        formatted += indent + placeholder;
        totalChars += indent.length + placeholder.length;
      }
      return;
    }

    const isModalContainer = isModalLikeElement(el);
    if (!isElementVisible(el) && tag !== 'body' && !isModalContainer) return;

    const indent = tab.repeat(depth);
    let openTag = `<${tag}`;

    for (const attr of el.attributes) {
      if (allowedAttrs.has(attr.name)) {
        openTag += ` ${attr.name}="${attr.value}"`;
      }
    }

    const voidElements = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'];
    const isVoid = voidElements.includes(tag);
    openTag += isVoid ? ' />' : '>';

    if (formatted.length > 0 && !formatted.endsWith('\n')) formatted += '\n';
    formatted += indent + openTag;
    totalChars += indent.length + openTag.length;

    if (!isVoid) {
      const children = Array.from(el.childNodes);
      const hasElementChild = children.some(c => c.nodeType === Node.ELEMENT_NODE && !skipTags.has((c as Element).tagName?.toLowerCase()));

      if (hasElementChild) {
        children.forEach(c => serialize(c, depth + 1));
        if (!formatted.endsWith('\n')) formatted += '\n';
        formatted += indent + `</${tag}>`;
        totalChars += indent.length + tag.length + 3;
      } else {
        const text = el.textContent?.trim() ?? '';
        const truncated = text.length > 200 ? text.slice(0, 200) + '...' : text;
        formatted += truncated + `</${tag}>`;
        totalChars += truncated.length + tag.length + 3;
      }
    }
  }

  serialize(root, 0);
  return formatted;
}

export function formatHTML(html: string): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const root = doc.body.firstElementChild || doc.head.firstElementChild;
  if (!root) return html;
  return getSimplifiedHTML(root, 10000);
}
