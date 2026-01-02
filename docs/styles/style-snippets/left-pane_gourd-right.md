# Custom Style
```css
:root {
  --gourd-pane-width: 360px;
}

/* ---------------- Invert: Right pane on LEFT ---------------- */

/* Move right pane to the left */
[class*="_rightPane_"] {
  order: -1 !important;

  border-left: none !important;
  border-right: 1px solid #333 !important;
}

/* Keep the resizer between the left pane and the main content */
[class*="_verticalResizer_"] {
  order: 0 !important;
}

/* Main content stays to the right */
[class*="_leftColumn_"] {
  order: 1 !important;
}

/* ---------------- Invert: Fake "Gourd" pane on RIGHT of main ---------------- */

[class*="_leftColumn_"] {
  position: relative !important;
  overflow: visible !important;

  /* make space on the RIGHT for gourds */
  padding-right: var(--gourd-pane-width) !important;

  /* IMPORTANT: remove any prior left-padding gourd setup */
  padding-left: 0 !important;
}

[class*="_leftColumn_"]::after {
  content: "GOURDS";
  position: absolute;
  top: 0;
  bottom: 0;
  right: 0;
  width: var(--gourd-pane-width);

  background: rgba(0, 255, 0, 0.10);
  outline: 2px solid rgba(0, 255, 0, 0.85);
  outline-offset: -2px;
  border-radius: 10px;

  padding: 10px;
  font-size: 12px;
  letter-spacing: 0.2em;
  color: rgba(255, 255, 255, 0.85);

  pointer-events: none;
  z-index: 9999;
}

```