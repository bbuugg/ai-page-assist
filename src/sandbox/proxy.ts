/**
 * MCP-UI sandbox proxy script — runs inside the proxy iframe (sandbox.html).
 *
 * Implements the double-iframe architecture expected by @mcp-ui/client:
 *   parent (overlay)  ->  this proxy  ->  inner iframe (guest HTML)
 *
 * Protocol (JSON-RPC 2.0 over postMessage):
 *   1. Proxy creates inner iframe, posts JSON-RPC "ui/notifications/sandbox-proxy-ready"
 *      notification to parent so AppFrame knows it can send HTML.
 *   2. Parent posts "ui/notifications/sandbox-resource-ready" { params: { html, csp } }
 *      — proxy writes the HTML via document.write into the inner iframe.
 *   3. All other postMessages are relayed bidirectionally between parent
 *      and inner iframe (this is how JSON-RPC tool calls flow).
 */
(function () {
  const inner = document.createElement('iframe');
  inner.id = 'root';
  let pendingHtml: string | null = null;

  function renderHtmlInIframe(markup: string): boolean {
    const doc = inner.contentDocument || (inner.contentWindow && inner.contentWindow.document);
    if (!doc) return false;
    try {
      doc.open();
      doc.write(markup);
      doc.close();
      return true;
    } catch (error) {
      console.error('[sandbox-proxy] Failed to write HTML:', error);
      return false;
    }
  }

  inner.addEventListener('load', () => {
    if (pendingHtml !== null && renderHtmlInIframe(pendingHtml)) {
      pendingHtml = null;
    }
  });

  inner.style.cssText = 'width:100%; height:100%; border:none;';
  // src=about:blank so the browser initializes contentDocument for document.write
  inner.src = 'about:blank';
  document.body.appendChild(inner);

  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source === window.parent && event.data && event.data.method === 'ui/notifications/sandbox-resource-ready') {
      // JSON-RPC notification from AppBridge delivering the guest HTML.
      const params = (event.data.params || {}) as { html?: string };
      const html = params.html;
      if (typeof html === 'string') {
        if (!renderHtmlInIframe(html)) {
          pendingHtml = html;
        }
      }
    } else if (event.source === window.parent) {
      // Forward parent -> inner (JSON-RPC requests/notifications from host)
      if (inner && inner.contentWindow) {
        inner.contentWindow.postMessage(event.data, '*');
      }
    } else if (event.source === inner.contentWindow) {
      // Relay inner -> parent (JSON-RPC requests/notifications from guest)
      window.parent.postMessage(event.data, '*');
    }
  });

  // Notify parent that the proxy is ready to receive HTML.
  // AppBridge listens for the JSON-RPC method "ui/notifications/sandbox-proxy-ready".
  window.parent.postMessage(
    {
      jsonrpc: '2.0',
      method: 'ui/notifications/sandbox-proxy-ready',
      params: {},
    },
    '*',
  );
})();
