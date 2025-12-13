function getStyleId(connectionId: string, pluginId: string) {
  const c = connectionId && connectionId.trim().length > 0 ? connectionId.trim() : 'default';
  return `plugin-css-style-${c}-${pluginId}`;
}

export function applyPluginBaseCss(connectionId: string, pluginId: string, css: string) {
  if (typeof document === 'undefined') return;

  const styleId = getStyleId(connectionId, pluginId);
  let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;

  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = styleId;
    document.head.appendChild(styleEl);
  }

  styleEl.innerHTML = css || '';
}

export function removePluginBaseCss(connectionId: string, pluginId: string) {
  if (typeof document === 'undefined') return;
  const styleId = getStyleId(connectionId, pluginId);
  const el = document.getElementById(styleId);
  if (el && el.parentNode) el.parentNode.removeChild(el);
}
