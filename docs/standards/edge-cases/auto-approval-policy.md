---
topic: "Agents that propose actions, with approval and auto-approval rules"
prefix: AUTOAPPR
applies-when: "auto-approve, approval, confidence threshold, agent suggests commands, copilot, trust settings, hard floor, never-auto, escalation"
---

### AUTOAPPR-01 An unclassifiable action or a missing confidence is auto-approved, or a setting overrides the hard floor
- Applies when: rules decide whether an action runs without asking the user.
- Edge case: a command the classifier does not recognise falls through to "allowed"; a confidence of `NaN` or `undefined` passes a `>=` comparison; an alias or abbreviation of a floor command (`dro`, `giv`) is not matched; a saved setting enables a category the code defines as never-auto.
- Required behaviour: the decision defaults to ask. The hard floor is evaluated before any setting and no setting can change it. Unknown class, missing or non-finite confidence, and stale state all resolve to ask.
- Verify: table tests for unknown commands, `NaN`/`undefined`/negative/above-one confidence, aliases and abbreviations of floor commands, and a settings blob that tries to enable a floor category; each asserts the outcome is "ask".
- Origin: 2026-11-05_copilot-ai-training-sibling-to-autopilot
