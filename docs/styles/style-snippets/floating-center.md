# Custom Style
```css
:root {
  --gourd-modal-width: 560px;
  --gourd-modal-height: min(720px, calc(100vh - 120px));
  --gourd-modal-radius: 14px;
}

/* Backdrop (visual only) */
body::before {
  content: "";
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  opacity: 0;

  /* IMPORTANT: don't steal hover */
  pointer-events: none;

  transition: opacity 160ms ease;
  z-index: 99990;
}

/* Modal (visual only) */
body::after {
  content: "GOURDS (fake modal)\A\AHover the right pane to preview.\A(Click insideF through is enabled — visual only.)";
  white-space: pre-wrap;

  position: fixed;
  left: 50%;
  top: 50%;
  width: var(--gourd-modal-width);
  height: var(--gourd-modal-height);
  transform: translate(-50%, -50%) scale(0.98);
  opacity: 0;

  /* IMPORTANT: don't steal hover */
  pointer-events: none;

  background: rgba(0, 255, 0, 0.10);
  border: 1px solid rgba(0, 255, 0, 0.55);
  border-radius: var(--gourd-modal-radius);
  box-shadow:
    0 18px 50px rgba(0, 0, 0, 0.55),
    0 0 0 1px rgba(255, 255, 255, 0.06) inset;

  padding: 16px;
  color: rgba(255, 255, 255, 0.9);
  font-size: 13px;
  line-height: 1.4;

  transition: opacity 160ms ease, transform 160ms ease;
  z-index: 99991;
}

/* OPEN when hovering the right pane */
body:has([class*="_rightPane_"]:hover)::before,
body:has([class*="_rightPane_"]:hover)::after {
  opacity: 1;
}

/* Modal “pop” */
body:has([class*="_rightPane_"]:hover)::after {
  transform: translate(-50%, -50%) scale(1);
}

/* Optional: reduce accidental flicker when brushing edges */
body::before,
body::after {
  transition-delay: 0ms;
}
body:not(:has([class*="_rightPane_"]:hover))::before,
body:not(:has([class*="_rightPane_"]:hover))::after {
  transition-delay: 90ms; /* tiny grace period on close */
}

```