# Custom Style
```css
:root {
  --gourd-pane-width: 360px;
  --gourd-peek: 22px;     /* how much is visible when collapsed */
  --gourd-pop-gap: 10px;
}

[class*="_leftColumn_"] {
  position: relative !important;
  overflow: visible !important;
  padding-right: 0 !important;
}

/* collapsed by default (peeking) */
[class*="_leftColumn_"]::after {
  content: "GOURDS";
  position: absolute;
  top: 10px;
  bottom: 10px;
  left: calc(100% + var(--gourd-pop-gap));
  width: var(--gourd-pane-width);

  background: rgba(0, 255, 0, 0.10);
  border: 1px solid rgba(0, 255, 0, 0.55);
  border-radius: 14px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);

  padding: 12px;
  font-size: 12px;
  letter-spacing: 0.2em;
  color: rgba(255, 255, 255, 0.85);

  pointer-events: none;
  z-index: 9999;

  /* slide it mostly off-screen to the right */
  transform: translateX(calc(var(--gourd-pane-width) - var(--gourd-peek)));
  transition: transform 180ms ease;
}

/* expand on hover over the main area */
[class*="_leftColumn_"]:hover::after {
  transform: translateX(0);
}

```