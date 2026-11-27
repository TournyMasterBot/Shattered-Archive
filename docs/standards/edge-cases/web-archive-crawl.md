---
topic: "Crawling a login-protected website into a committed, browsable archive"
prefix: WEBARCH
applies-when: "crawler, scraper, forum archive, snapshot of a website, Playwright login session, session cookie, SID in URLs, raw HTML snapshot, browsing archived third-party HTML, search index over archived posts, resume after interruption"
---

### WEBARCH-01 An expired session is stored as empty content
- Applies when: a crawl needs a login (or a per-board password) and runs long enough for the session to lapse, or hits a board the account cannot open.
- Edge case: the site answers HTTP 200 with a login form, an access-denied notice or an empty list. A parser that finds no posts records "no posts", and the gap looks like a finished board.
- Required behaviour: every page type has a positive marker (a container or text that only the real page has). A page without its marker is a login loss or an inaccessible page: the run stops (login loss) or the board is recorded as `inaccessible` with the reason. An empty page is recorded as empty only when its empty-state marker is present.
- Verify: a test serves a fixture login page in the middle of a topic list and asserts the run stops with state kept and nothing written as empty; a fixture with the real empty-state marker is recorded as empty.
- Origin: 2026-11-19_dsl-forum-historical-archive

### WEBARCH-02 A session token is committed with the snapshot
- Applies when: the site puts a session id in page URLs or links, so stored URLs, raw HTML, JSON or crawl state carry it into git.
- Edge case: a live session id (Restricted data) is committed in dozens of thousands of files, and the same page fetched twice stores different bytes.
- Required behaviour: session ids are removed from every stored URL, from raw HTML (value replaced by a fixed placeholder) and from the state file; identity comes from stable ids (forum id, topic id, post id), never from the URL string. The login session itself (cookies) lives only in a git-ignored folder.
- Verify: a test feeds a fixture page whose links carry a session id and asserts none of the stored files contain it; a scan of the whole archive folder for the id pattern finds none; `git check-ignore` confirms the session folder is ignored.
- Origin: 2026-11-19_dsl-forum-historical-archive

### WEBARCH-03 Archived third-party HTML is rendered unsanitized
- Applies when: a page shows stored post bodies written by other people (possibly years old, from an old forum editor).
- Edge case: a post holds a script tag, an event-handler attribute, a remote image or an iframe. Injecting it as HTML runs code or phones a remote host the moment the archive is browsed.
- Required behaviour: bodies render through an allow-list of formatting tags; links carry `rel="noopener noreferrer"`; images show as links, never load automatically; the raw HTML files are never rendered.
- Verify: a test renders a fixture post containing a script tag, an `onerror` attribute and an iframe and asserts the output DOM has none of them and shows the text; a screenshot of that post shows inert text.
- Origin: 2026-11-19_dsl-forum-historical-archive

### WEBARCH-04 A crawl claims completeness without reconciling counts
- Applies when: a crawl is said to have captured "everything" from a paginated source whose content can change while it runs.
- Edge case: a pagination off-by-one, a post that shifts pages during the run, a skipped sub board or a failed page leaves a quiet gap; the run exits cleanly and nobody notices.
- Required behaviour: after each board a reconciliation report compares topics listed with topics stored, and posts stored per topic with the site's own reply count; failed, inaccessible and mismatched items are listed by id. A board is only marked complete when it reconciles or every difference is explained.
- Verify: a test drops one page from a fixture topic and asserts the report names that topic and the board stays incomplete; a clean fixture reconciles with zero differences.
- Origin: 2026-11-19_dsl-forum-historical-archive
