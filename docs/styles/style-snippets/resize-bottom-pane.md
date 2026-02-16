# Overview
This changes the height of the bottom pane, particularly useful for mobile

# CSS
```css
[class^="_bottomPane_"],
[class*=" _bottomPane_"] {
  height: 155px !important;
  max-height: none !important;
  min-height: 0 !important;
}
```