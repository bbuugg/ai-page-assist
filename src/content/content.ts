let isSelecting = false;
let isEditingText = false;
let sessionActive = false;
let hoveredElement: Element | null = null;
let lastElementData: { html: string; css: string } | null = null;

const HIGHLIGHT_CLASS = 'ai-extension-highlight-element';

// ---- DOM modification undo stack ----
type UndoSnapshot = { node: Element; html: string; style: string }[];
let lastUndoSnapshot: UndoSnapshot | null = null;

function snapshotNodes(nodes: Element[]): UndoSnapshot {
  return nodes.map(n => ({ node: n, html: n.outerHTML, style: (n as HTMLElement).getAttribute('style') ?? '' }));
}

function applyUndoSnapshot(snapshot: UndoSnapshot) {
  for (const { node, html, style } of snapshot) {
    const tmp = document.createElement('template');
    tmp.innerHTML = html;
    const restored = tmp.content.firstElementChild as HTMLElement | null;
    if (restored) {
      node.replaceWith(restored);
    } else {
      // fallback: just restore inline style
      (node as HTMLElement).setAttribute('style', style);
    }
  }
}

// ---- DOM pruning and simplification ----
function isElementVisible(el: Element): boolean {
  const style = window.getComputedStyle(el);
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0' &&
    (el as HTMLElement).offsetWidth > 0 &&
    (el as HTMLElement).offsetHeight > 0
  );
}

function getSimplifiedHTML(root: Element, maxLength = 20000): string {
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
      // Emit a placeholder for skipped tags so AI knows they exist
      const placeholderTags = new Set(['svg', 'canvas', 'iframe', 'template']);
      if (placeholderTags.has(tag)) {
        const indent = tab.repeat(depth);
        const idAttr = (el as Element).id ? ` id="${(el as Element).id}"` : '';
        const classAttr = (el as Element).className ? ` class="${(el as Element).className}"` : '';
        const placeholder = `<${tag}${idAttr}${classAttr} />`;
        if (formatted.length > 0 && !formatted.endsWith('\n')) formatted += '\n';
        formatted += indent + placeholder;
        totalChars += indent.length + placeholder.length;
      }
      return;
    }
    if (!isElementVisible(el) && tag !== 'body') return;

    const indent = tab.repeat(depth);
    let openTag = `<${tag}`;
    
    for (const attr of el.attributes) {
      if (allowedAttrs.has(attr.name)) {
        openTag += ` ${attr.name}="${attr.value}"`;
      }
    }

    const voidElements = ['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'];
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

// ---- Legacy HTML formatting (still used for snippet views) ----
function formatHTML(html: string): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const root = doc.body.firstElementChild || doc.head.firstElementChild;
  if (!root) return html;
  
  // Re-use pruning logic for consistency but with looser limits
  return getSimplifiedHTML(root, 10000);
}

// ---- Post message to side panel via background ----
function postToPanel(payload: object) {
  chrome.runtime.sendMessage({ action: 'toPanel', payload });
}

// ---- Element selection ----
function onMouseOver(e: MouseEvent) {
  const target = e.target as Element;
  if (target.id === 'ai-assist-root') return;
  hoveredElement = target;
  target.classList.add(HIGHLIGHT_CLASS);
}

function onMouseOut(e: MouseEvent) {
  (e.target as Element).classList.remove(HIGHLIGHT_CLASS);
}

function onElementClick(e: MouseEvent) {
  e.stopPropagation();
  e.preventDefault();
  if (hoveredElement) hoveredElement.classList.remove(HIGHLIGHT_CLASS);
  disableSelection();

  postToPanel({ type: 'LOADING' });

  chrome.runtime.sendMessage(
    { action: 'inspectElement', tabId: undefined, x: e.clientX, y: e.clientY },
    (response: { html?: string; css?: string; backendNodeId?: number; error?: string }) => {
      if (response?.error) {
        postToPanel({ type: 'ERROR', message: response.error });
        return;
      }
      const html = formatHTML(response.html ?? '');
      const css = response.css ?? '';
      lastElementData = { html, css };
      postToPanel({ type: 'ELEMENT_DATA', html, css, backendNodeId: response.backendNodeId });
    }
  );
}

function enableSelection() {
  isSelecting = true;
  document.addEventListener('mouseover', onMouseOver, true);
  document.addEventListener('mouseout', onMouseOut, true);
  document.addEventListener('click', onElementClick, true);
  postToPanel({ type: 'SELECTING_CHANGED', value: true });
}

function disableSelection() {
  isSelecting = false;
  document.removeEventListener('mouseover', onMouseOver, true);
  document.removeEventListener('mouseout', onMouseOut, true);
  document.removeEventListener('click', onElementClick, true);
  if (hoveredElement) { hoveredElement.classList.remove(HIGHLIGHT_CLASS); hoveredElement = null; }
  postToPanel({ type: 'SELECTING_CHANGED', value: false });
}

// ---- Text editing ----
function handleTextEditClick(e: MouseEvent) {
  e.stopPropagation();
  e.preventDefault();
}

function enableTextEditing() {
  isEditingText = true;
  document.designMode = 'on';
  document.addEventListener('click', handleTextEditClick, true);
  postToPanel({ type: 'EDITING_CHANGED', value: true });
}

function disableTextEditing() {
  isEditingText = false;
  if (document.designMode === 'on') document.designMode = 'off';
  document.removeEventListener('click', handleTextEditClick, true);
  postToPanel({ type: 'EDITING_CHANGED', value: false });
}

// ---- AI visual effects ----
function showScanEffect(persistent = false) {
  const existing = document.getElementById('ai-fx-scan');
  if (existing) existing.remove();

  const W = window.innerWidth;
  const H = window.innerHeight;
  const T = 4; // stroke width
  // perimeter for dasharray
  const perimeter = 2 * (W + H);
  // light streak length
  const streak = Math.round(perimeter * 0.18);
  const gap = perimeter - streak;

  const styleId = 'ai-fx-scan-style';
  if (!document.getElementById(styleId)) {
    const s = document.createElement('style');
    s.id = styleId;
    s.textContent = `
      @keyframes ai-flow {
        from { stroke-dashoffset: 0; }
        to   { stroke-dashoffset: -${perimeter}; }
      }
      @keyframes ai-flow2 {
        from { stroke-dashoffset: -${Math.round(perimeter * 0.5)}; }
        to   { stroke-dashoffset: -${Math.round(perimeter * 0.5) + perimeter}; }
      }
      @keyframes ai-fade-in { from { opacity:0 } to { opacity:1 } }
    `;
    document.documentElement.appendChild(s);
  }

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'ai-fx-scan';
  svg.setAttribute('width', String(W));
  svg.setAttribute('height', String(H));
  Object.assign(svg.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483646',
    pointerEvents: 'none',
    opacity: '0',
  });

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');

  // gradient 1: rainbow
  const grad1 = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
  grad1.id = 'ai-flow-g1';
  grad1.setAttribute('gradientUnits', 'userSpaceOnUse');
  grad1.setAttribute('x1', '0'); grad1.setAttribute('y1', '0');
  grad1.setAttribute('x2', String(W)); grad1.setAttribute('y2', '0');
  [['0%','#ff2d55'],['25%','#bf5af2'],['50%','#007aff'],['75%','#30d158'],['100%','#ffd60a']].forEach(([offset, color]) => {
    const stop = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop.setAttribute('offset', offset as string);
    stop.setAttribute('stop-color', color as string);
    grad1.appendChild(stop);
  });

  // gradient 2: offset rainbow for second streak
  const grad2 = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
  grad2.id = 'ai-flow-g2';
  grad2.setAttribute('gradientUnits', 'userSpaceOnUse');
  grad2.setAttribute('x1', String(W)); grad2.setAttribute('y1', '0');
  grad2.setAttribute('x2', '0'); grad2.setAttribute('y2', '0');
  [['0%','#007aff'],['33%','#bf5af2'],['66%','#ff2d55'],['100%','#ffd60a']].forEach(([offset, color]) => {
    const stop = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop.setAttribute('offset', offset as string);
    stop.setAttribute('stop-color', color as string);
    grad2.appendChild(stop);
  });

  // glow filter
  const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
  filter.id = 'ai-flow-glow';
  filter.setAttribute('x', '-20%'); filter.setAttribute('y', '-20%');
  filter.setAttribute('width', '140%'); filter.setAttribute('height', '140%');
  const blur = document.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur');
  blur.setAttribute('stdDeviation', '3');
  blur.setAttribute('result', 'coloredBlur');
  const merge = document.createElementNS('http://www.w3.org/2000/svg', 'feMerge');
  const mn1 = document.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode');
  mn1.setAttribute('in', 'coloredBlur');
  const mn2 = document.createElementNS('http://www.w3.org/2000/svg', 'feMergeNode');
  mn2.setAttribute('in', 'SourceGraphic');
  merge.appendChild(mn1); merge.appendChild(mn2);
  filter.appendChild(blur); filter.appendChild(merge);


  defs.appendChild(grad1); defs.appendChild(grad2); defs.appendChild(filter);
  svg.appendChild(defs);

  const rx = T * 2; // slight rounding
  const rectPath = `M${rx},${T/2} H${W - rx} Q${W - T/2},${T/2} ${W - T/2},${rx} V${H - rx} Q${W - T/2},${H - T/2} ${W - rx},${H - T/2} H${rx} Q${T/2},${H - T/2} ${T/2},${H - rx} V${rx} Q${T/2},${T/2} ${rx},${T/2} Z`;

  function makeStreak(gradId: string, animName: string, opacity: string): SVGPathElement {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', rectPath);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', `url(#${gradId})`);
    path.setAttribute('stroke-width', String(T));
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-dasharray', `${streak} ${gap}`);
    path.setAttribute('filter', 'url(#ai-flow-glow)');
    Object.assign(path.style, {
      opacity,
      animation: `${animName} ${persistent ? '2.4s' : '1.8s'} linear ${persistent ? 'infinite' : '1'} forwards`,
    });
    return path;
  }

  svg.appendChild(makeStreak('ai-flow-g1', 'ai-flow', '1'));
  svg.appendChild(makeStreak('ai-flow-g2', 'ai-flow2', '0.6'));

  document.documentElement.appendChild(svg);

  // fade in
  svg.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, fill: 'forwards' });

  if (!persistent) {
    setTimeout(() => {
      svg.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'forwards' })
        .onfinish = () => svg.remove();
    }, 1800);
  }
}

function hideScanEffect() {
  const el = document.getElementById('ai-fx-scan');
  if (el) {
    el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'forwards' })
      .onfinish = () => el.remove();
  }
}

let aiCursorEl: HTMLDivElement | null = null;
let aiCursorIdleAnim: Animation | null = null;
let aiCursorX = 0;
let aiCursorY = 0;

const AI_CURSOR_SVG = `<svg width="32" height="36" viewBox="0 0 32 36" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="ai-cur-grad" x1="4" y1="2" x2="20" y2="28" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#a78bfa"/>
      <stop offset="100%" stop-color="#38bdf8"/>
    </linearGradient>
    <filter id="ai-cur-glow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="2.5" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="ai-cur-shadow" x="-20%" y="-20%" width="150%" height="150%">
      <feDropShadow dx="1" dy="2" stdDeviation="2" flood-color="rgba(99,60,180,0.4)"/>
    </filter>
  </defs>
  <!-- cursor body -->
  <path d="M5 2L5 26L11 20L15.5 30L18.5 28.5L14 19L21 19L5 2Z"
    fill="url(#ai-cur-grad)" stroke="rgba(255,255,255,0.6)" stroke-width="1"
    stroke-linejoin="round" filter="url(#ai-cur-shadow)"/>
  <!-- AI sparkle -->
  <g filter="url(#ai-cur-glow)">
    <path d="M22 6 L23.2 9.2 L26.5 10 L23.2 10.8 L22 14 L20.8 10.8 L17.5 10 L20.8 9.2 Z"
      fill="#fff" opacity="0.95"/>
  </g>
</svg>`;

// Hotspot offset: arrow tip is at approximately (5, 2) within the 32x36 SVG
const AI_CURSOR_HOTSPOT_X = 5;
const AI_CURSOR_HOTSPOT_Y = 2;

function createAICursorEl(): HTMLDivElement {
  const cursor = document.createElement('div');
  cursor.id = 'ai-fx-cursor';
  cursor.innerHTML = AI_CURSOR_SVG;
  Object.assign(cursor.style, {
    position: 'fixed',
    left: `-${AI_CURSOR_HOTSPOT_X}px`,
    top: `-${AI_CURSOR_HOTSPOT_Y}px`,
    zIndex: '2147483647',
    pointerEvents: 'none',
    willChange: 'transform, opacity',
  });
  document.documentElement.appendChild(cursor);
  return cursor;
}

function startIdleAnim(cursor: HTMLDivElement) {
  if (aiCursorIdleAnim) { aiCursorIdleAnim.cancel(); aiCursorIdleAnim = null; }
  aiCursorIdleAnim = cursor.animate(
    [
      { transform: `translate(${aiCursorX}px, ${aiCursorY}px) translateY(0px)` },
      { transform: `translate(${aiCursorX}px, ${aiCursorY}px) translateY(-6px)` },
      { transform: `translate(${aiCursorX}px, ${aiCursorY}px) translateY(0px)` },
    ],
    { duration: 2200, easing: 'ease-in-out', iterations: Infinity }
  );
}

function showAICursorIdle() {
  if (aiCursorEl) return; // already visible
  const cursor = createAICursorEl();
  aiCursorEl = cursor;
  aiCursorX = window.innerWidth / 2;
  aiCursorY = window.innerHeight / 2;
  cursor.style.opacity = '0';
  cursor.style.transform = `translate(${aiCursorX}px, ${aiCursorY}px)`;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      cursor.style.transition = 'opacity 0.3s ease';
      cursor.style.opacity = '1';
      setTimeout(() => {
        if (aiCursorEl === cursor) startIdleAnim(cursor);
      }, 300);
    });
  });
}

function hideAICursor() {
  const cursor = aiCursorEl;
  if (!cursor) return;
  if (aiCursorIdleAnim) { aiCursorIdleAnim.cancel(); aiCursorIdleAnim = null; }
  aiCursorEl = null; // clear immediately so new showAICursor calls create a fresh cursor
  cursor.style.transition = 'opacity 0.35s ease';
  cursor.style.opacity = '0';
  setTimeout(() => cursor.remove(), 380);
}

// Get ancestor chain from element up to (not including) root
function getAncestors(el: Element, root: Element | null): Element[] {
  const chain: Element[] = [];
  let cur: Element | null = el;
  while (cur && cur !== root) { chain.push(cur); cur = cur.parentElement; }
  return chain;
}

// Dispatch proper mouseover/mouseenter/mouseout/mouseleave sequence when pointer moves from prevEl to nextEl
function dispatchMouseTransition(prevEl: Element | null, nextEl: Element | null, x: number, y: number) {
  if (prevEl === nextEl) return;
  if (prevEl) {
    prevEl.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, cancelable: true, clientX: x, clientY: y, relatedTarget: nextEl }));
    // Fire mouseleave up the chain for ancestors that are no longer hovered
    if (nextEl) {
      const prevChain = getAncestors(prevEl, null);
      const nextChain = new Set(getAncestors(nextEl, null));
      for (const ancestor of prevChain) {
        if (!nextChain.has(ancestor)) {
          ancestor.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false, cancelable: false, clientX: x, clientY: y, relatedTarget: nextEl }));
        }
      }
    } else {
      getAncestors(prevEl, null).forEach(a =>
        a.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false, cancelable: false, clientX: x, clientY: y, relatedTarget: null }))
      );
    }
  }
  if (nextEl) {
    nextEl.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, clientX: x, clientY: y, relatedTarget: prevEl }));
    // Fire mouseenter down the chain for ancestors that are newly hovered
    if (prevEl) {
      const nextChain = getAncestors(nextEl, null);
      const prevChainSet = new Set(getAncestors(prevEl, null));
      // Fire in top-down order for newly entered ancestors
      [...nextChain].reverse().forEach(ancestor => {
        if (!prevChainSet.has(ancestor)) {
          ancestor.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false, cancelable: false, clientX: x, clientY: y, relatedTarget: prevEl }));
        }
      });
    } else {
      [...getAncestors(nextEl, null)].reverse().forEach(a =>
        a.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false, cancelable: false, clientX: x, clientY: y, relatedTarget: null }))
      );
    }
  }
}

// Simulate mouse movement along a straight path dispatching proper mouse events
function simulateMousePath(fromX: number, fromY: number, toX: number, toY: number, durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    const startTime = performance.now();
    // Temporarily set pointer-events none on cursor for elementFromPoint
    if (aiCursorEl) aiCursorEl.style.pointerEvents = 'none';
    let lastEl: Element | null = document.elementFromPoint(fromX, fromY);

    function step(now: number) {
      const t = Math.min((now - startTime) / durationMs, 1);
      const x = fromX + (toX - fromX) * t;
      const y = fromY + (toY - fromY) * t;

      const el = document.elementFromPoint(x, y);

      if (el !== lastEl) {
        dispatchMouseTransition(lastEl, el, x, y);
        lastEl = el;
      }
      if (el) {
        el.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
      }

      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        if (aiCursorEl) aiCursorEl.style.pointerEvents = '';
        resolve();
      }
    }
    requestAnimationFrame(step);
  });
}

function showAICursor(selector: string): Promise<void> {
  return new Promise((resolve) => {
    const target = document.querySelector(selector);
    const rect = target ? target.getBoundingClientRect() : null;
    const targetX = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const targetY = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;

    // Stop idle animation
    if (aiCursorIdleAnim) { aiCursorIdleAnim.cancel(); aiCursorIdleAnim = null; }

    let cursor = aiCursorEl;
    const isNew = !cursor;
    if (!cursor) {
      cursor = createAICursorEl();
      aiCursorEl = cursor;
      aiCursorX = window.innerWidth / 2;
      aiCursorY = window.innerHeight / 2;
      cursor.style.opacity = '0';
      cursor.style.transform = `translate(${aiCursorX}px, ${aiCursorY}px)`;
    } else {
      // Snapshot current rendered position from idle anim
      const computed = getComputedStyle(cursor).transform;
      const m = computed.match(/matrix\([^,]+,[^,]+,[^,]+,[^,]+,([^,]+),([^)]+)\)/);
      if (m) {
        aiCursorX = parseFloat(m[1]);
        aiCursorY = parseFloat(m[2]);
      }
      cursor.style.transform = `translate(${aiCursorX}px, ${aiCursorY}px)`;
    }

    const fromX = aiCursorX;
    const fromY = aiCursorY;
    const moveDuration = 550;

    const doMove = () => {
      cursor!.style.transition = `transform ${moveDuration}ms cubic-bezier(0.4,0,0.2,1), opacity 0.18s ease`;
      cursor!.style.opacity = '1';
      cursor!.style.transform = `translate(${targetX}px, ${targetY}px)`;
      aiCursorX = targetX;
      aiCursorY = targetY;

      // Simulate mouse path events alongside the visual animation
      simulateMousePath(fromX, fromY, targetX, targetY, moveDuration);

      // Click animation after arriving
      setTimeout(() => {
        cursor!.style.transition = 'transform 0.12s cubic-bezier(0.4,0,0.2,1)';
        cursor!.style.transform = `translate(${targetX}px, ${targetY}px) scale(0.75)`;
        setTimeout(() => {
          cursor!.style.transform = `translate(${targetX}px, ${targetY}px) scale(1)`;
          aiCursorX = targetX;
          aiCursorY = targetY;
          // Stay at target position and start idle animation there
          setTimeout(() => {
            if (aiCursorEl === cursor) startIdleAnim(cursor!);
          }, 150);
          resolve();
        }, 130);
      }, moveDuration + 30);
    };

    if (isNew) {
      requestAnimationFrame(() => requestAnimationFrame(doMove));
    } else {
      doMove();
    }
  });
}


const INTERACTIVE_SEL = 'a, button, input, select, textarea, [onclick], [role="button"], [role="link"], [role="menuitem"], [role="tab"], [tabindex]';

// ---- Tool execution ----
function sendToolResult(id: string, type: string, result: unknown) {
  postToPanel({ type: `${type}_RESULT`, id, result: String(result) });
}

function sendToolError(id: string, type: string, error: string) {
  postToPanel({ type: `${type}_RESULT`, id, error });
}


// ---- Message listener from background / side panel ----
// Clean up AI visual effects when page is restored from BFCache
window.addEventListener('pageshow', (e) => {
  if (e.persisted) {
    sessionActive = false;
    const scanEl = document.getElementById('ai-fx-scan');
    if (scanEl) scanEl.remove();
    hideAICursor();
  }
});

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  const { action } = request;

  if (action === 'showBorderFx') {
    sessionActive = true;
    showScanEffect(true);
    showAICursorIdle();
    return false;
  }
  if (action === 'hideBorderFx') {
    sessionActive = false;
    const el = document.getElementById('ai-fx-scan');
    if (el) {
      el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'forwards' })
        .onfinish = () => el.remove();
    }
    hideAICursor();
    return false;
  }
  if (action === 'toggleSelect') {
    if (isSelecting) disableSelection(); else enableSelection();
    return false;
  }
  if (action === 'toggleEdit') {
    if (isEditingText) disableTextEditing(); else enableTextEditing();
    return false;
  }
  if (action === 'captureFull') {
    if (isSelecting) disableSelection();
    const html = formatHTML(document.documentElement.outerHTML);
    lastElementData = { html, css: '' };
    postToPanel({ type: 'ELEMENT_DATA', html, css: '' });
    postToPanel({ type: 'SYSTEM_MSG', text: 'Captured full page HTML.' });
    return false;
  }
  if (action === 'highlightNode') {
    // highlight by backendNodeId is no-op in content (CDP handled in background)
    return false;
  }

  // Tool calls forwarded from side panel via background — respond via sendResponse
  if (action === 'tool') {
    const { tool, input } = request;
    (async () => {
      try {
        switch (tool) {
          case 'get_element_html':
            if (!sessionActive) showScanEffect();
            sendResponse({ result: lastElementData?.html ?? 'No element selected.' });
            if (!sessionActive) setTimeout(() => hideScanEffect(), 800);
            break;
          case 'get_element_css':
            if (!sessionActive) showScanEffect();
            sendResponse({ result: lastElementData?.css ?? 'No element selected.' });
            if (!sessionActive) setTimeout(() => hideScanEffect(), 800);
            break;
          case 'get_full_page_html': {
            if (!sessionActive) showScanEffect();
            const html = getSimplifiedHTML(document.documentElement);
            sendResponse({ result: html });
            if (!sessionActive) setTimeout(() => hideScanEffect(), 800);
            break;
          }
          case 'highlight_element': {
            await showAICursor(input.selector as string);
            const el = document.querySelector(input.selector as string);
            if (!el) throw new Error(`No element for selector: ${input.selector}`);
            el.classList.add(HIGHLIGHT_CLASS);
            setTimeout(() => el.classList.remove(HIGHLIGHT_CLASS), 3000);
            sendResponse({ result: `Highlighted: ${input.selector}` });
            break;
          }
          case 'fill_input': {
            await showAICursor(input.selector as string);
            const el = document.querySelector(input.selector as string) as HTMLInputElement | HTMLTextAreaElement | null;
            if (!el) { sendResponse({ error: `Element not found: ${input.selector}` }); break; }
            const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
            const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
            if (setter) setter.call(el, input.value);
            else el.value = input.value as string;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            sendResponse({ result: 'ok' });
            break;
          }
          case 'click_element': {
            await showAICursor(input.selector as string);
            const el = document.querySelector(input.selector as string) as HTMLElement | null;
            if (!el) { sendResponse({ error: `Element not found: ${input.selector}` }); break; }
            el.click();
            sendResponse({ result: 'ok' });
            break;
          }
          case 'query_page': {
            if (!sessionActive) showScanEffect();
            const selector = (input.selector as string | undefined) || '*';
            const keyword = (input.keyword as string | undefined)?.toLowerCase() ?? '';
            const limit = Math.min(Number(input.limit) || 10, 30);
            const nodes = Array.from(document.querySelectorAll(selector));
            const matched = keyword
              ? nodes.filter(el => el.textContent?.toLowerCase().includes(keyword))
              : nodes;
            const results = matched.slice(0, limit).map(el => {
              const tag = el.tagName.toLowerCase();
              const text = (el.textContent ?? '').trim().slice(0, 200);
              // Use getSimplifiedHTML for cleaner snippets
              const cleanHtml = getSimplifiedHTML(el, 1000);
              return `<${tag}> text: ${JSON.stringify(text)}\nhtml: ${cleanHtml}`;
            });
            if (results.length === 0) {
              sendResponse({ result: 'No elements matched.' });
            } else {
              sendResponse({ result: `Found ${results.length} element(s):\n\n${results.join('\n\n---\n\n')}` });
            }
            if (!sessionActive) setTimeout(() => hideScanEffect(), 800);
            break;
          }
          case 'scroll_page': {
            const x = (input.x as number) ?? 0;
            const y = (input.y as number) ?? 0;
            const sel = input.selector as string | undefined;
            if (sel) {
              const el = document.querySelector(sel);
              if (!el) { sendResponse({ result: 'element not found' }); break; }
              el.scrollBy(x, y);
            } else {
              const prev = window.scrollY;
              window.scrollBy(x, y);
              if (window.scrollY === prev) {
                const se = document.scrollingElement || document.documentElement;
                se.scrollTop += y;
                se.scrollLeft += x;
              }
            }
            sendResponse({ result: `scrolled by x=${x} y=${y}` });
            break;
          }
          case 'send_keys': {
            const keyTarget = input.selector
              ? document.querySelector(input.selector as string) as HTMLElement | null
              : (document.activeElement as HTMLElement | null) ?? document.body;
            if (input.selector && !keyTarget) { sendResponse({ error: `Element not found: ${input.selector}` }); break; }
            const key = input.key as string;
            const evOpts = { key, code: key, bubbles: true, cancelable: true };
            keyTarget!.dispatchEvent(new KeyboardEvent('keydown', evOpts));
            keyTarget!.dispatchEvent(new KeyboardEvent('keypress', evOpts));
            keyTarget!.dispatchEvent(new KeyboardEvent('keyup', evOpts));
            sendResponse({ result: `Sent key ${key}` });
            break;
          }
          case 'hover_element': {
            await showAICursor(input.selector as string);
            const hoverEl = document.querySelector(input.selector as string) as HTMLElement | null;
            if (!hoverEl) { sendResponse({ error: `Element not found: ${input.selector}` }); break; }
            hoverEl.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
            hoverEl.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
            hoverEl.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
            sendResponse({ result: `Hovered: ${input.selector}` });
            break;
          }
          case 'select_option': {
            await showAICursor(input.selector as string);
            const selectEl = document.querySelector(input.selector as string) as HTMLSelectElement | null;
            if (!selectEl) { sendResponse({ error: `Element not found: ${input.selector}` }); break; }
            const val = input.value as string;
            const opt = Array.from(selectEl.options).find(o => o.value === val || o.text === val);
            if (!opt) { sendResponse({ error: `Option not found: ${val}` }); break; }
            selectEl.value = opt.value;
            selectEl.dispatchEvent(new Event('change', { bubbles: true }));
            sendResponse({ result: `Selected: ${opt.text}` });
            break;
          }
          case 'clear_input': {
            await showAICursor(input.selector as string);
            const clearEl = document.querySelector(input.selector as string) as HTMLInputElement | HTMLTextAreaElement | null;
            if (!clearEl) { sendResponse({ error: `Element not found: ${input.selector}` }); break; }
            const proto = clearEl.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
            const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
            if (setter) setter.call(clearEl, '');
            else clearEl.value = '';
            clearEl.dispatchEvent(new Event('input', { bubbles: true }));
            clearEl.dispatchEvent(new Event('change', { bubbles: true }));
            sendResponse({ result: 'ok' });
            break;
          }
          case 'wait': {
            const ms = Math.min(Number(input.ms) || 1000, 10000);
            await new Promise(r => setTimeout(r, ms));
            sendResponse({ result: `Waited ${ms}ms` });
            break;
          }
          case 'wait_for_element': {
            const waitSel = input.selector as string;
            const timeout = Math.min(Number(input.timeout_ms) || 5000, 15000);
            const existing = document.querySelector(waitSel);
            if (existing) { sendResponse({ result: `Element found: ${waitSel}` }); break; }
            const waitResult = await new Promise<string>((resolve) => {
              const timer = setTimeout(() => {
                observer.disconnect();
                resolve(`Timeout: element not found within ${timeout}ms`);
              }, timeout);
              const observer = new MutationObserver(() => {
                if (document.querySelector(waitSel)) {
                  clearTimeout(timer);
                  observer.disconnect();
                  resolve(`Element found: ${waitSel}`);
                }
              });
              observer.observe(document.documentElement, { childList: true, subtree: true });
            });
            sendResponse({ result: waitResult });
            break;
          }
          case 'scroll_to_element': {
            await showAICursor(input.selector as string);
            const scrollEl = document.querySelector(input.selector as string);
            if (!scrollEl) { sendResponse({ error: `Element not found: ${input.selector}` }); break; }
            scrollEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            sendResponse({ result: `Scrolled to: ${input.selector}` });
            break;
          }
          case 'drag_and_drop': {
            const fromEl = document.querySelector(input.from_selector as string) as HTMLElement | null;
            const toEl = document.querySelector(input.to_selector as string) as HTMLElement | null;
            if (!fromEl) { sendResponse({ error: `Source not found: ${input.from_selector}` }); break; }
            if (!toEl) { sendResponse({ error: `Target not found: ${input.to_selector}` }); break; }
            await showAICursor(input.from_selector as string);
            const fromRect = fromEl.getBoundingClientRect();
            const toRect = toEl.getBoundingClientRect();
            const dt = new DataTransfer();
            fromEl.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt, clientX: fromRect.left + fromRect.width/2, clientY: fromRect.top + fromRect.height/2 }));
            fromEl.dispatchEvent(new DragEvent('drag', { bubbles: true, dataTransfer: dt }));
            toEl.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: dt, clientX: toRect.left + toRect.width/2, clientY: toRect.top + toRect.height/2 }));
            toEl.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt, clientX: toRect.left + toRect.width/2, clientY: toRect.top + toRect.height/2 }));
            fromEl.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
            sendResponse({ result: `Dragged from ${input.from_selector} to ${input.to_selector}` });
            break;
          }
          case 'get_dom_state': {
            const interactive = Array.from(document.querySelectorAll(
              'a[href], button, input, select, textarea, [onclick], [role="button"], [role="link"], [role="tab"], [role="menuitem"], [tabindex]'
            )).filter(el => {
              const r = el.getBoundingClientRect();
              return r.width > 0 && r.height > 0;
            }).slice(0, 50).map((el, i) => {
              const tag = el.tagName.toLowerCase();
              const text = (el.textContent ?? '').trim().slice(0, 80);
              const attrs: string[] = [];
              if (el.id) attrs.push(`id="${el.id}"`);
              if ((el as HTMLElement).className) attrs.push(`class="${(el as HTMLElement).className.toString().slice(0, 40)}"`);
              if ((el as HTMLInputElement).type) attrs.push(`type="${(el as HTMLInputElement).type}"`);
              if ((el as HTMLAnchorElement).href) attrs.push(`href="${(el as HTMLAnchorElement).href.slice(0, 60)}"`);
              if ((el as HTMLInputElement).placeholder) attrs.push(`placeholder="${(el as HTMLInputElement).placeholder}"`);
              if ((el as HTMLInputElement).value) attrs.push(`value="${(el as HTMLInputElement).value.slice(0, 40)}"`);
              return `[${i}] <${tag} ${attrs.join(' ')}>${text}</${tag}>`;
            });
            sendResponse({ result: `Page: ${document.title}\nURL: ${location.href}\n\nInteractive elements:\n${interactive.join('\n')}` });
            break;
          }
          case 'execute_js': {
            // Delegate to background via chrome.scripting.executeScript to bypass page CSP
            chrome.runtime.sendMessage(
              { action: 'executeScript', code: input.code },
              (response: { result?: unknown; error?: string }) => {
                if (response?.error) sendResponse({ error: response.error });
                else sendResponse({ result: response?.result !== undefined ? JSON.stringify(response.result) : 'null' });
              }
            );
            return; // sendResponse called async via background
          }
          case 'modify_element': {
            // Snapshot body.innerHTML BEFORE running the code so undo is always possible
            lastUndoSnapshot = [{ node: document.body, html: document.body.innerHTML, style: '' }];
            chrome.runtime.sendMessage(
              { action: 'executeScript', code: input.code as string },
              (response: { result?: unknown; error?: string }) => {
                if (response?.error) {
                  lastUndoSnapshot = null; // code failed, nothing to undo
                  sendResponse({ error: response.error });
                  return;
                }
                const resultStr = response?.result !== undefined
                  ? JSON.stringify(response.result)
                  : `Done: ${input.description}`;
                sendResponse({ result: resultStr });
              }
            );
            return; // sendResponse called async
          }
          case 'undo_last_modification': {
            if (!lastUndoSnapshot) {
              sendResponse({ result: 'Nothing to undo.' });
              break;
            }
            const snapshot = lastUndoSnapshot;
            lastUndoSnapshot = null;
            for (const { node, html } of snapshot) {
              if (node === document.body) {
                document.body.innerHTML = html;
              } else {
                applyUndoSnapshot([{ node, html, style: '' }]);
              }
            }
            sendResponse({ result: 'Undone.' });
            break;
          }
          case 'upload_file_to_input': {
            const el = document.querySelector(input.selector as string) as HTMLInputElement | null;
            if (!el || el.type !== 'file') { sendResponse({ error: `File input not found: ${input.selector}` }); break; }
            const byteChars = atob(input.base64 as string);
            const bytes = new Uint8Array(byteChars.length);
            for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
            const file = new File([bytes], input.filename as string, { type: input.mime_type as string });
            const dt = new DataTransfer();
            dt.items.add(file);
            el.files = dt.files;
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('input', { bubbles: true }));
            sendResponse({ result: `Uploaded ${input.filename} to ${input.selector}` });
            break;
          }
          case 'extract_page_elements': {
            const selectors: string[] = Array.isArray(input.selectors) ? (input.selectors as string[]) : [];
            const keywords: string[] = Array.isArray(input.keywords) ? (input.keywords as string[]) : [];
            const limit: number = typeof input.limit === 'number' ? input.limit : 5;

            function elementSummary(el: Element): object {
              const truncatedHtml = getSimplifiedHTML(el, 600);
              const text = (el.textContent ?? '').trim().slice(0, 200);
              // Build a unique CSS path (up to 4 ancestors)
              const parts: string[] = [];
              let cur: Element | null = el;
              for (let i = 0; i < 5 && cur && cur !== document.documentElement; i++) {
                let seg = cur.tagName.toLowerCase();
                if (cur.id) { seg += `#${cur.id}`; parts.unshift(seg); break; }
                if (cur.className) seg += '.' + [...cur.classList].slice(0, 2).join('.');
                parts.unshift(seg);
                cur = cur.parentElement;
              }
              return {
                tag: el.tagName.toLowerCase(),
                id: el.id || undefined,
                class: el.className || undefined,
                text: text || undefined,
                html: truncatedHtml,
                path: parts.join(' > '),
              };
            }

            const seen = new Set<Element>();
            const results: object[] = [];

            for (const sel of selectors) {
              try {
                const matches = Array.from(document.querySelectorAll(sel)).slice(0, limit);
                for (const el of matches) {
                  if (!seen.has(el)) { seen.add(el); results.push(elementSummary(el)); }
                }
              } catch { /* invalid selector, skip */ }
            }

            for (const kw of keywords) {
              const lower = kw.toLowerCase();
              const all = Array.from(document.querySelectorAll('body *'));
              let count = 0;
              for (const el of all) {
                if (count >= limit) break;
                if (!seen.has(el) && el.children.length === 0 && (el.textContent ?? '').toLowerCase().includes(lower)) {
                  seen.add(el);
                  results.push(elementSummary(el));
                  count++;
                }
              }
            }

            if (results.length === 0) {
              sendResponse({ result: 'No elements found for the given selectors/keywords.' });
            } else {
              sendResponse({ result: JSON.stringify(results, null, 2) });
            }
            break;
          }
          default:
            throw new Error(`Unknown tool: ${tool}`);
        }
      } catch (err) {
        sendResponse({ error: (err as Error).message });
      }
    })();
    return true; // keep message channel open for async sendResponse
  }
});

// Clean up any leftover elements from a previous content script instance
(function cleanup() {
  document.getElementById('ai-fx-cursor')?.remove();
  document.getElementById('ai-fx-scan')?.remove();
  document.getElementById('ai-fx-scan-style')?.remove();
})();
