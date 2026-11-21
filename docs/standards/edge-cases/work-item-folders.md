---
topic: "Moving, closing and signing off plans and work-item folders"
prefix: WORKITEM
applies-when: "move a plan, rename a plan, close a plan, mark a plan COMPLETE, closed-incomplete, .ai-plans, .ai-plans-completed, completed plan, sign-off, plan review, work-item folder"
---

### WORKITEM-01 A moved or renamed plan leaves dangling path references
- Applies when: a plan file or work-item folder is moved, renamed or split (active to completed, closed-incomplete to completed, completed to .pr).
- Edge case: code comments, `.annotated` and `.ai-context` files, docs, and other plans (in this repo and in sibling repos) still name the old path, so the link a reader follows leads nowhere.
- Required behaviour: before the move, search every repo the plan touched for the old path and its file name; in the same step as the move, update every hit (or record why a historical mention stays), and move only on the owner's word.
- Verify: after the move, a repository-wide search for the old path returns no hit outside the explicitly kept historical mentions, and the new path opens.
- Origin: 2026-11-18_active-and-closed-plan-reviews

### WORKITEM-02 A plan is marked COMPLETE while steps were never run
- Applies when: a plan is closed, signed off, or given a COMPLETE status, or a review decides whether it belongs in completed.
- Edge case: the status line says COMPLETE while steps are unchecked, only code-complete, or waiting for a device or real-game session, so a reader assumes the feature was verified.
- Required behaviour: closing a plan records every unexecuted step by name with the reason and who owns it, and every step marked done names what verified it (a test run, a log, or the owner's word); a plan with an unexecuted step is not filed as completed.
- Verify: every unchecked step in the closed plan has a written disposition, and every checked step has a verified-by line; a search of the plan for unchecked steps returns only dispositions.
- Origin: 2026-11-18_active-and-closed-plan-reviews
