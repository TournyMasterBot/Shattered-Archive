---
topic: "Public pages that search engines index: titles, descriptions and generated page text"
prefix: SEO
applies-when: "Razor view, page title, meta description, ViewData Description, sitemap, search engine, crawler, per-entity page, generated page text, Server.Web.Public/Views"
---

### SEO-01 A public page uses the sitewide default description or a shared title
- Applies when: a Razor view that a crawler can reach is added or changed, or one template serves many URLs (per-entity pages, per-continent pages).
- Edge case: the page renders the layout's fallback description or a static title, so thousands of URLs show the same snippet and look like duplicates to a search engine.
- Required behaviour: the view sets `ViewData["Description"]` and a title that names the entity; a data-driven view builds both from its model and has a page-specific fallback when the model is null.
- Verify: a guard test over the view files asserts every page view sets a description and that literal descriptions are unique and within the length bound; two live GETs of different URLs of one view return different meta descriptions.
- Origin: 2026-11-18_finish-sitemaps-and-seo-plan

### SEO-02 A generated description overreaches
- Applies when: description text is generated from game data (rooms, creatures, items, areas).
- Edge case: the text includes free text (a room description can hold character names), is unbounded, is not safe in an HTML attribute, or is cut in the middle of a character.
- Required behaviour: it is built only from a fixed template plus the entity's name and numeric facts, whitespace-collapsed, cut at a word boundary within the length bound, never splitting a surrogate pair, and encoded by the template engine.
- Verify: builder tests with a long name, a name with quotes and an ampersand, a blank name and an emoji at the cut point; a live GET shows the encoded text in the meta tag.
- Origin: 2026-11-18_finish-sitemaps-and-seo-plan
