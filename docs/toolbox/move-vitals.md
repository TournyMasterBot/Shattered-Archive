# Left Aligned
```css
/****************************************************
 * PoC: Move status block over play area (bottom-left)
 * and show a friendly electric mouse placeholder
 * where it originally lived in the right pane.
 *
 * NOTE: This relies on the current CSS-module class
 * names from your build:
 *   ._layoutShell_1luap_124
 *   ._playArea_1luap_150
 *   ._rightPane_1luap_178
 *   ._statusBlock_1luap_322
 * If you rebuild and hashes change, update selectors.
 ****************************************************/

@media (min-width: 901px) {
  /* Make sure the app shell is our positioning context (for vars) */
  ._layoutShell_1luap_124 {
    position: relative;
  }

  /* Play area: ensure it sits under the floating panel */
  ._playArea_1luap_150 {
    position: relative;
    z-index: 0;
  }

  /* Move the status block out over the play area */
  ._statusBlock_1luap_322 {
    position: fixed; /* detach from right pane layout */
    left: 12px;
    bottom: calc(var(--bottom-pane-height, 220px) + 12px);

    /* Size / look */
    width: 360px;
    max-width: 40vw;
    background: transparent !important; /* transparent bg as requested */
    box-shadow: none !important;
    border: none !important;

    z-index: 2000; /* stay above play area but below menus/modals */
  }

  /* Optional: tighten inner spacing now that it's floating */
  ._statusBlock_1luap_322 ._barGroup_1luap_355 {
    margin-top: 4px;
  }

  /* Right pane: show a friendly electric mouse where the block used to be */
  ._rightPane_1luap_178 {
    position: relative;
    padding-top: 8px; /* space so the mouse doesn't touch the header */
  }

  ._rightPane_1luap_178::before {
    content: "⚡🐭 Friendly Electric Mouse Zone ⚡";
    display: flex;
    align-items: center;
    justify-content: center;

    height: 72px;
    margin: 0 4px 8px 4px;

    font-size: 0.8rem;
    color: #ffeb99;
    background: #111;
    border: 1px solid #333;
    border-radius: 4px;
  }
}
```
# Bottom Right
```css
/****************************************************
 * PoC: Move status block (tick + HP/MP/Stam + enemy)
 * to the TOP-RIGHT of the play area (left pane),
 * with a transparent background, and show a friendly
 * electric mouse placeholder in the original sidebar.
 *
 * Desktop-only (>= 901px); small screens untouched.
 ****************************************************/

@media (min-width: 901px) {
  /* 1) Make the main layout shell a positioning context */
  ._layoutShell_1luap_124 {
    position: relative !important;
  }

  /* 2) Let absolutely positioned children escape sidebar bounds */
  ._rightPane_1luap_178 {
    position: static !important;
    padding-top: 8px;
  }

  /* 3) Float the status block over the play area (top-right) */
  ._statusBlock_1luap_322 {
    position: absolute !important;

    /* Top edge roughly aligned with top of play area */
    bottom: calc(var(--bottom-pane-height, 220px) + 12px);

    /* From the right edge of the whole layout, step left by:
       - the right pane width
       - the vertical resizer width (4px)
       - an extra 16px of padding inside the play area */
    right: calc(var(--right-pane-width) + 4px + 16px);

    width: 360px;
    max-width: 40vw;

    background: transparent !important;
    border: none !important;
    box-shadow: none !important;

    z-index: 2000; /* above play area text, below menus */
  }

  /* Tweak inner spacing a bit while it's floating */
  ._statusBlock_1luap_322 ._barGroup_1luap_355 {
    margin-top: 4px;
  }

  /* 4) Friendly electric mouse placeholder in the sidebar */
  ._rightPane_1luap_178::before {
    content: "⚡🐭 Friendly Electric Mouse Zone ⚡";
    display: flex;
    align-items: center;
    justify-content: center;

    height: 72px;
    margin: 0 4px 8px 4px;

    font-size: 0.8rem;
    color: #ffeb99;
    background: #111;
    border: 1px solid #333;
    border-radius: 4px;
  }
}

```

# Right Aligned
```css
/****************************************************
 * PoC: Move status block (tick + HP/MP/Stam + enemy)
 * to the TOP-RIGHT of the play area (left pane),
 * with a transparent background, and show a friendly
 * electric mouse placeholder in the original sidebar.
 *
 * Desktop-only (>= 901px); small screens untouched.
 ****************************************************/

@media (min-width: 901px) {
  /* 1) Make the main layout shell a positioning context */
  ._layoutShell_1luap_124 {
    position: relative !important;
  }

  /* 2) Let absolutely positioned children escape sidebar bounds */
  ._rightPane_1luap_178 {
    position: static !important;
    padding-top: 8px;
  }

  /* 3) Float the status block over the play area (top-right) */
  ._statusBlock_1luap_322 {
    position: absolute !important;

    /* Top edge roughly aligned with top of play area */
    top: 8px;

    /* From the right edge of the whole layout, step left by:
       - the right pane width
       - the vertical resizer width (4px)
       - an extra 16px of padding inside the play area */
    right: calc(var(--right-pane-width) + 4px + 16px);

    width: 360px;
    max-width: 40vw;

    background: transparent !important;
    border: none !important;
    box-shadow: none !important;

    z-index: 2000; /* above play area text, below menus */
  }

  /* Tweak inner spacing a bit while it's floating */
  ._statusBlock_1luap_322 ._barGroup_1luap_355 {
    margin-top: 4px;
  }

  /* 4) Friendly electric mouse placeholder in the sidebar */
  ._rightPane_1luap_178::before {
    content: "⚡🐭 Friendly Electric Mouse Zone ⚡";
    display: flex;
    align-items: center;
    justify-content: center;

    height: 72px;
    margin: 0 4px 8px 4px;

    font-size: 0.8rem;
    color: #ffeb99;
    background: #111;
    border: 1px solid #333;
    border-radius: 4px;
  }
}
```