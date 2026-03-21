import { showAICursor } from './ai-effects';
import {
  collectElementsDeep,
  findClosestTopLayerContainer,
  findTopLayerElements,
  getElementClientPoint,
  getSimplifiedHTML,
  isModalLikeElement,
  querySelectorAllDeep,
  querySelectorDeep,
  resolveElement,
} from './dom-utils';

type LastElementData = { html: string; css: string } | null;
type UndoSnapshot = { node: Element; html: string; style: string }[] | null;
type SendResponse = (response?: unknown) => void;

export type ToolHandlerContext = {
  getLastElementData: () => LastElementData;
  setUndoSnapshot: (snapshot: UndoSnapshot) => void;
  getUndoSnapshot: () => UndoSnapshot;
  applyUndoSnapshot: (snapshot: { node: Element; html: string; style: string }[]) => void;
  highlightClass: string;
  isSessionActive: () => boolean;
};

export async function handleToolMessage(
  tool: string,
  input: Record<string, unknown>,
  sendResponse: SendResponse,
  context: ToolHandlerContext,
): Promise<void> {
  try {
    switch (tool) {
      case 'get_element_html':
        sendResponse({ result: context.getLastElementData()?.html ?? 'No element selected.' });
        return;
      case 'get_element_css':
        sendResponse({ result: context.getLastElementData()?.css ?? 'No element selected.' });
        return;
      case 'get_full_page_html':
        sendResponse({ result: getSimplifiedHTML(document.documentElement) });
        return;
      case 'highlight_element': {
        const el = resolveElement(input.selector as string);
        if (!el) throw new Error(`No element for selector: ${input.selector}`);
        await showAICursor(input.selector as string);
        el.classList.add(context.highlightClass);
        setTimeout(() => el.classList.remove(context.highlightClass), 3000);
        sendResponse({ result: `Highlighted: ${input.selector}` });
        return;
      }
      case 'fill_input': {
        const el = resolveElement(input.selector as string) as HTMLElement | null;
        if (!el) {
          sendResponse({ error: `Element not found: ${input.selector}` });
          return;
        }
        const isInput = el instanceof HTMLInputElement;
        const isTextarea = el instanceof HTMLTextAreaElement;
        const isContentEditable = el.isContentEditable;
        if (!isInput && !isTextarea && !isContentEditable) {
          sendResponse({ error: `Element is not an input, textarea, or contenteditable` });
          return;
        }
        // Move cursor to element and click it first (same as reference)
        await showAICursor(input.selector as string);
        el.focus();
        const value = input.value as string;
        if (isContentEditable) {
          // Plan A: beforeinput -> mutation -> input (works for LinkedIn, React contenteditable, Quill)
          // Clear existing content
          if (el.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'deleteContent' }))) {
            el.innerText = '';
            el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContent' }));
          }
          // Insert new text
          if (el.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: value }))) {
            el.innerText = value;
            el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
          }
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.blur();
        } else if (isTextarea) {
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
          if (nativeSetter) nativeSetter.call(el, value); else (el as HTMLTextAreaElement).value = value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.blur();
        } else {
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          if (nativeSetter) nativeSetter.call(el, value); else (el as HTMLInputElement).value = value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.blur();
        }
        await new Promise((r) => setTimeout(r, 100));
        const actual = isContentEditable ? (el.textContent ?? '') : (el as HTMLInputElement).value;
        if (isContentEditable ? !actual.includes(value) : actual !== value) {
          sendResponse({ result: `Warning: value set to "${value}" but element now shows "${actual}". The field may be controlled by the framework and rejected the value.` });
        } else {
          sendResponse({ result: 'ok' });
        }
        return;
      }
      case 'click_element': {
        const el = resolveElement(input.selector as string) as HTMLElement | null;
        if (!el) {
          sendResponse({ error: `Element not found: ${input.selector}` });
          return;
        }
        await showAICursor(el);
        // hover
        el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));
        // press
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
        // focus
        el.focus();
        // release + click
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        await new Promise((r) => setTimeout(r, 200));
        sendResponse({ result: 'ok' });
        return;
      }
      case 'query_page': {
        const selector = (input.selector as string | undefined) || '*';
        const keyword = ((input.keyword as string | undefined) ?? (input.text as string | undefined) ?? '').toLowerCase();
        const limit = Math.min(Number(input.limit) || 10, 30);
        const skipTags = new Set(['HTML', 'HEAD', 'BODY', 'SCRIPT', 'STYLE', 'NOSCRIPT', 'META', 'LINK']);
        const topLayerRoots = findTopLayerElements(3);
        const topLayerNodes = topLayerRoots.flatMap((root) => {
          if (!(root instanceof Element)) return [];
          try {
            const selfMatches = root.matches(selector) ? [root] : [];
            return [...selfMatches, ...Array.from(root.querySelectorAll(selector))];
          } catch {
            return [];
          }
        });
        const nodes = [...topLayerNodes, ...querySelectorAllDeep(selector)].filter((el, index, arr) => {
          if (arr.indexOf(el) !== index) return false;
          if (skipTags.has(el.tagName)) return false;
          const r = el.getBoundingClientRect();
          return r.width > 0 || r.height > 0;
        });
        const matched = keyword ? nodes.filter(el => el.textContent?.toLowerCase().includes(keyword)) : nodes;
        const results = matched.slice(0, limit).map((el) => {
          const tag = el.tagName.toLowerCase();
          const text = (el.textContent ?? '').trim().slice(0, 200);
          const cleanHtml = getSimplifiedHTML(el, 1000);
          return `<${tag}> text: ${JSON.stringify(text)}\nhtml: ${cleanHtml}`;
        });
        sendResponse({
          result: results.length === 0
            ? 'No elements matched. The element may be inside a shadow DOM or iframe, try using execute_js to access it.'
            : `Found ${results.length} element(s):\n\n${results.join('\n\n---\n\n')}`,
        });
        return;
      }
      case 'scroll_page': {
        const x = (input.x as number) ?? 0;
        const y = (input.y as number) ?? 0;
        const selector = input.selector as string | undefined;
        if (selector) {
          const el = document.querySelector(selector);
          if (!el) {
            sendResponse({ result: 'element not found' });
            return;
          }
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
        return;
      }
      case 'send_keys': {
        const keyTarget = input.selector
          ? resolveElement(input.selector as string) as HTMLElement | null
          : (document.activeElement as HTMLElement | null) ?? document.body;
        if (input.selector && !keyTarget) {
          sendResponse({ error: `Element not found: ${input.selector}` });
          return;
        }
        const target = keyTarget!;
        try { target.focus?.(); } catch { /* ignore */ }
        const key = input.key as string;
        const evOpts = { key, code: key, bubbles: true, cancelable: true };
        try {
          target.dispatchEvent(new KeyboardEvent('keydown', evOpts));
          target.dispatchEvent(new KeyboardEvent('keypress', evOpts));
          target.dispatchEvent(new KeyboardEvent('keyup', evOpts));
        } catch (e) {
          sendResponse({ error: `send_keys failed: ${(e as Error).message}` });
          return;
        }
        sendResponse({ result: `Sent key ${key}` });
        return;
      }
      case 'hover_element': {
        const hoverEl = resolveElement(input.selector as string) as HTMLElement | null;
        if (!hoverEl) {
          sendResponse({ error: `Element not found: ${input.selector}` });
          return;
        }
        await showAICursor(input.selector as string);
        const { x, y } = getElementClientPoint(hoverEl);
        const cdpResult = await new Promise<{ result?: string; error?: string }>((res) =>
          chrome.runtime.sendMessage({ action: 'cdpHover', x, y }, res)
        );
        if (cdpResult?.error) {
          hoverEl.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: x, clientY: y }));
          hoverEl.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false, clientX: x, clientY: y }));
          hoverEl.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y }));
        }
        sendResponse({ result: `Hovered: ${input.selector}` });
        return;
      }
      case 'select_option': {
        const selectEl = resolveElement(input.selector as string) as HTMLSelectElement | null;
        if (!selectEl) {
          sendResponse({ error: `Element not found: ${input.selector}` });
          return;
        }
        await showAICursor(input.selector as string);
        const value = typeof input.value === 'string' ? input.value.trim() : '';
        const label = typeof input.label === 'string' ? input.label.trim() : '';
        const normalizedValue = value.toLowerCase();
        const normalizedLabel = label.toLowerCase();
        const opt = Array.from(selectEl.options).find((o) => {
          const optionText = o.text.trim().toLowerCase();
          const optionLabel = o.label.trim().toLowerCase();
          const optionValue = o.value.trim().toLowerCase();
          return (
            (!!value && optionValue === normalizedValue) ||
            (!!label && (optionText === normalizedLabel || optionLabel === normalizedLabel)) ||
            (!!value && (optionText === normalizedValue || optionLabel === normalizedValue))
          );
        });
        if (!opt) {
          sendResponse({ error: `Option not found: ${value || label}` });
          return;
        }
        const index = Array.from(selectEl.options).indexOf(opt);
        if (index >= 0) selectEl.selectedIndex = index;
        opt.selected = true;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
        if (setter) setter.call(selectEl, opt.value);
        else selectEl.value = opt.value;
        selectEl.focus({ preventScroll: true });
        selectEl.dispatchEvent(new Event('input', { bubbles: true }));
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        sendResponse({ result: `Selected: ${opt.text}` });
        return;
      }
      case 'clear_input': {
        const clearEl = resolveElement(input.selector as string) as HTMLInputElement | HTMLTextAreaElement | null;
        if (!clearEl) {
          sendResponse({ error: `Element not found: ${input.selector}` });
          return;
        }
        await showAICursor(input.selector as string);
        const proto = clearEl.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (setter) setter.call(clearEl, '');
        else clearEl.value = '';
        clearEl.dispatchEvent(new Event('input', { bubbles: true }));
        clearEl.dispatchEvent(new Event('change', { bubbles: true }));
        sendResponse({ result: 'ok' });
        return;
      }
      case 'wait': {
        const ms = Math.min(Number(input.ms) || 1000, 10000);
        await new Promise((r) => setTimeout(r, ms));
        sendResponse({ result: `Waited ${ms}ms` });
        return;
      }
      case 'wait_for_element': {
        const waitSel = input.selector as string;
        const timeout = Math.min(Number(input.timeout_ms) || 5000, 15000);
        const existing = querySelectorDeep(waitSel);
        if (existing) {
          sendResponse({ result: `Element found: ${waitSel}` });
          return;
        }
        const waitResult = await new Promise<string>((resolve) => {
          const timer = setTimeout(() => {
            observer.disconnect();
            resolve(`Timeout: element not found within ${timeout}ms`);
          }, timeout);
          const observer = new MutationObserver(() => {
            const found = querySelectorDeep(waitSel);
            const topLayer = findTopLayerElements(1)[0];
            const topLayerMatch = topLayer?.matches(waitSel)
              ? topLayer
              : topLayer?.querySelector(waitSel) ?? null;
            if (found || topLayerMatch) {
              clearTimeout(timer);
              observer.disconnect();
              resolve(`Element found: ${waitSel}`);
            }
          });
          observer.observe(document.documentElement, { childList: true, subtree: true });
        });
        sendResponse({ result: waitResult });
        return;
      }
      case 'scroll_to_element': {
        const scrollEl = resolveElement(input.selector as string);
        if (!scrollEl) {
          sendResponse({ error: `Element not found: ${input.selector}` });
          return;
        }
        await showAICursor(input.selector as string);
        scrollEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        sendResponse({ result: `Scrolled to: ${input.selector}` });
        return;
      }
      case 'drag_and_drop': {
        const sourceSelector = (input.source_selector as string | undefined) ?? (input.from_selector as string | undefined);
        const targetSelector = (input.target_selector as string | undefined) ?? (input.to_selector as string | undefined);
        const fromEl = sourceSelector ? querySelectorDeep(sourceSelector) as HTMLElement | null : null;
        const toEl = targetSelector ? querySelectorDeep(targetSelector) as HTMLElement | null : null;
        if (!fromEl) {
          sendResponse({ error: `Source not found: ${sourceSelector}` });
          return;
        }
        if (!toEl) {
          sendResponse({ error: `Target not found: ${targetSelector}` });
          return;
        }
        await showAICursor(sourceSelector!);
        const fromRect = fromEl.getBoundingClientRect();
        const toRect = toEl.getBoundingClientRect();
        const dt = new DataTransfer();
        fromEl.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt, clientX: fromRect.left + fromRect.width / 2, clientY: fromRect.top + fromRect.height / 2 }));
        fromEl.dispatchEvent(new DragEvent('drag', { bubbles: true, dataTransfer: dt }));
        toEl.dispatchEvent(new DragEvent('dragover', { bubbles: true, dataTransfer: dt, clientX: toRect.left + toRect.width / 2, clientY: toRect.top + toRect.height / 2 }));
        toEl.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: dt, clientX: toRect.left + toRect.width / 2, clientY: toRect.top + toRect.height / 2 }));
        fromEl.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
        sendResponse({ result: `Dragged from ${sourceSelector} to ${targetSelector}` });
        return;
      }
      case 'get_dom_state': {
        const interactive = querySelectorAllDeep(
          'a[href], button, input, select, textarea, [onclick], [role="button"], [role="link"], [role="tab"], [role="menuitem"], [tabindex]'
        ).filter((el) => {
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
        const modals = findTopLayerElements(10).map((el, i) => {
          const tag = el.tagName.toLowerCase();
          const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 120);
          const rect = el.getBoundingClientRect();
          const z = window.getComputedStyle(el).zIndex;
          return `[${i}] <${tag}> z=${z} rect=${Math.round(rect.width)}x${Math.round(rect.height)} ${text}`;
        });
        sendResponse({ result: `Page: ${document.title}\nURL: ${location.href}\n\nOpen dialogs / overlays:\n${modals.join('\n') || 'None'}\n\nInteractive elements:\n${interactive.join('\n')}` });
        return;
      }
      case 'get_page_context': {
        const skip = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'HEAD']);
        const parts: string[] = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node: Node | null;
        while ((node = walker.nextNode()) && parts.join(' ').length < 3000) {
          const p = (node as Text).parentElement;
          if (!p || skip.has(p.tagName)) continue;
          const t = (node.textContent ?? '').trim();
          if (t.length > 1) parts.push(t);
        }
        sendResponse({ result: `URL: ${location.href}\nTitle: ${document.title}\n\nPage text summary:\n${parts.join(' ').slice(0, 3000)}` });
        return;
      }
      case 'execute_js':
        chrome.runtime.sendMessage(
          { action: 'executeScript', code: input.code },
          (response: { result?: unknown; error?: string }) => {
            if (chrome.runtime.lastError) {
              sendResponse({ error: chrome.runtime.lastError.message });
              return;
            }
            if (response?.error) {
              const msg = response.error;
              const isBlocked = msg.includes('EvalError') || msg.includes('Content Security Policy') || msg.includes('unsafe-eval') || msg.includes('eval');
              sendResponse({ error: isBlocked ? `execute_js blocked by page CSP. Use other tools (click_element, fill_input, extract_page_elements) instead. Original error: ${msg}` : msg });
            } else {
              const val = response?.result;
              if (val === '__undefined__') sendResponse({ result: 'undefined' });
              else if (val === '__null__') sendResponse({ result: 'null (script returned null)' });
              else if (val === '__promise__') sendResponse({ error: 'execute_js returned a Promise — wrap async code in an IIFE with await, or use void.' });
              else sendResponse({ result: val !== undefined ? JSON.stringify(val) : 'undefined' });
            }
          }
        );
        return;
      case 'modify_element':
        context.setUndoSnapshot([{ node: document.body, html: document.body.innerHTML, style: '' }]);
        chrome.runtime.sendMessage(
          { action: 'executeScript', code: input.code as string },
          (response: { result?: unknown; error?: string }) => {
            if (response?.error) {
              context.setUndoSnapshot(null);
              sendResponse({ error: response.error });
              return;
            }
            const resultStr = response?.result !== undefined ? JSON.stringify(response.result) : `Done: ${input.description}`;
            sendResponse({ result: resultStr });
          }
        );
        return;
      case 'undo_last_modification': {
        const snapshot = context.getUndoSnapshot();
        if (!snapshot) {
          sendResponse({ result: 'Nothing to undo.' });
          return;
        }
        context.setUndoSnapshot(null);
        for (const { node, html } of snapshot) {
          if (node === document.body) document.body.innerHTML = html;
          else context.applyUndoSnapshot([{ node, html, style: '' }]);
        }
        sendResponse({ result: 'Undone.' });
        return;
      }
      case 'upload_file_to_input': {
        const el = resolveElement(input.selector as string) as HTMLInputElement | null;
        if (!el || el.type !== 'file') {
          sendResponse({ error: `File input not found: ${input.selector}` });
          return;
        }
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
        return;
      }
      case 'extract_page_elements': {
        const selectors: string[] = Array.isArray(input.selectors) ? (input.selectors as string[]) : [];
        const keywords: string[] = Array.isArray(input.keywords) ? (input.keywords as string[]) : [];
        const limit: number = typeof input.limit === 'number' ? input.limit : 5;

        function getCssSelector(el: Element): string {
          if (el.id && document.querySelectorAll(`#${CSS.escape(el.id)}`).length === 1) return `#${CSS.escape(el.id)}`;
          const parts: string[] = [];
          let cur: Element | null = el;
          while (cur && cur !== document.documentElement) {
            const tag = cur.tagName.toLowerCase();
            const parent = cur.parentElement;
            if (parent) {
              const siblings = Array.from(parent.children).filter((c) => c.tagName === cur!.tagName);
              parts.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${siblings.indexOf(cur) + 1})` : tag);
            } else {
              parts.unshift(tag);
            }
            cur = parent;
          }
          return parts.join(' > ');
        }

        function elementSummary(el: Element): object {
          const topLayerContainer = findClosestTopLayerContainer(el);
          return {
            tag: el.tagName.toLowerCase(),
            id: el.id || undefined,
            class: el.className || undefined,
            text: (el.textContent ?? '').trim().slice(0, 200) || undefined,
            html: getSimplifiedHTML(el, 600),
            selector: getCssSelector(el),
            top_layer: !!topLayerContainer,
            top_layer_container_tag: topLayerContainer?.tagName.toLowerCase(),
          };
        }

        const seen = new Set<Element>();
        const results: object[] = [];

        for (const sel of selectors) {
          try {
            const matches = querySelectorAllDeep(sel).slice(0, limit);
            for (const el of matches) {
              if (!seen.has(el)) {
                seen.add(el);
                results.push(elementSummary(el));
              }
            }
          } catch {}
        }

        for (const kw of keywords) {
          const lower = kw.toLowerCase();
          const topLayer = findTopLayerElements(3);
          const all = [...topLayer, ...collectElementsDeep()].sort((a, b) => {
            const aTop = findClosestTopLayerContainer(a) ? 1 : 0;
            const bTop = findClosestTopLayerContainer(b) ? 1 : 0;
            const aModal = isModalLikeElement(a) ? 1 : 0;
            const bModal = isModalLikeElement(b) ? 1 : 0;
            return (bTop - aTop) || (bModal - aModal);
          });
          let count = 0;
          for (const el of all) {
            if (count >= limit || seen.has(el)) continue;
            const text = (el.textContent ?? '').toLowerCase();
            if (!text.includes(lower)) continue;
            const r = el.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) continue;
            const childMatch = Array.from(el.children).some(c => (c.textContent ?? '').toLowerCase().includes(lower));
            if (childMatch) continue;
            seen.add(el);
            results.push(elementSummary(el));
            count++;
          }
        }

        sendResponse({
          result: results.length === 0 ? 'No elements found for the given selectors/keywords.' : JSON.stringify(results, null, 2),
        });
        return;
      }
      default:
        throw new Error(`Unknown tool: ${tool}`);
    }
  } catch (err) {
    sendResponse({ error: (err as Error).message });
  }
}
