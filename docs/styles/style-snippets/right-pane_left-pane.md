# Custom Style
```css
/* Move right pane to the left */
[class*="_rightPane_"] {
  order: -1 !important;

  border-left: none !important;
  border-right: 1px solid #333 !important;
}

/* Keep the resizer between the pane and the main content */
[class*="_verticalResizer_"] {
  order: 0 !important;
}

/* Ensure main content stays to the right */
[class*="_leftColumn_"] {
  order: 1 !important;
}

```