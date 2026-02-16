# Overview
This modifies the line height between rows in the xterm play area

# CSS
```css
/* 1) Force the rows container line-height */
.xterm .xterm-rows {
  line-height: 20px !important; /* pick a px value */
}

/* 2) Override per-row divs where xterm sets inline height/line-height */
.xterm .xterm-rows > div {
  height: 20px !important;
  line-height: 20px !important;
}

/* 3) Keep spans aligned within the row */
.xterm .xterm-rows span {
  line-height: 20px !important;
}
```