# Custom Style
```css
/* ---------------- Fake "Gourd" pane anchored to main play area ---------------- */
:root {
  --gourd-pane-width: 360px;
}

/* Ensure main content can host an absolutely-positioned faux pane */
[class*="_leftColumn_"] {
  position: relative !important;
  overflow: visible !important;

  /* create space on the left for the gourd pane */
  padding-left: var(--gourd-pane-width) !important;
}

/* Draw the gourd pane in that left padding space */
[class*="_leftColumn_"]::before {
  content: "GOURDS";
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: var(--gourd-pane-width);

  /* loud debug styling */
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