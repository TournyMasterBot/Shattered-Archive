# Overview
This removes the chat pill bar (Chat pane bar with 'All' and others)

# CSS
```css
[class^="_chatRoot_"] [class^="_chatTopBar_"],
[class^="_chatRoot_"] [class*=" _chatTopBar_"] {
  display: none !important;
}
```