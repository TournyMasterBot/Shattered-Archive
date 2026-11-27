---
type: proposal
title: Finish the sitemaps and SEO plan's open work, then close the plan
slug: 2026-11-18_finish-sitemaps-and-seo-plan
created: 2026-11-18
state: completed
data-classification: public
---

# Finish the sitemaps and SEO plan's open work, then close the plan

## Problem or opportunity

The closed plan `.ai-plans-completed/closed-incomplete/20260805-1500-sitemaps-and-seo.md` was marked COMPLETE with two steps marked partial (4 and 5) and one deliverable never written. During the 2026-11-18 plan review (`2026-11-18_active-and-closed-plan-reviews`, `findings.md` section 11) the owner said: "Complete the work, then close it." What the review found open:

1. Step 1 asked for a unit test of the route filter in `SitemapService`, including a case proving an action with an authorization attribute is excluded. No such test was found in the DSL test projects.
2. Step 4 (on-page SEO) is partial. The layout baseline is live, but only 11 of the 69 `.cshtml` files under `Server.Web.Public/Views` set `ViewData["Description"]`; the plan says about 30 views still fall back to the sitewide default description.
3. Step 5 (Search Console) needs the owner's own Google account: DNS-verified domain properties for both registrable domains, submitting both sitemaps, and reading the Coverage report. The plan says an agent cannot do this.

Working today: the local site's `/sitemap.xml` answers 200 as a sitemap index with 10 sub-sitemaps; `deploy/index.html` carries canonical and Open Graph tags.

## Proposed work

Complete the three open items above, then close the plan (move it from `closed-incomplete/` to `completed/`, on the owner's word, with the dispositions written into the plan). In the owner's words: "Complete the work, then close it."

## Who benefits

The owner (a plan list that is true) and search visitors to the public site, who get specific page descriptions and a sitemap whose exclusion rules are tested.

## Constraints and known unknowns

- Code is in the DSL repo (`Server.Web.Public/Services/SitemapService.cs`, `Controllers/SitemapController.cs`, `Views/`, `wwwroot/robots.txt`); the repo has no test class for the sitemap service today.
- Search Console setup (item 3) is the owner's: it needs their Google account and DNS access. The work item can prepare the steps but cannot finish it.
- Unknown: which of the 58 views without a description should get one (public content pages versus pages that should not be indexed), and what wording the owner wants.
- Unknown: whether the C# layout baseline and the sitemap content types still match the plan's recorded figures (10,326 URLs); the review only confirmed the index answers 200.
- Not sized or planned: capture only.

## Related

- `.ai-plans-completed/closed-incomplete/20260805-1500-sitemaps-and-seo.md` (the plan to complete)
- `.ai-plans/active/2026-11-18_active-and-closed-plan-reviews/findings.md` section 11 (the review's evidence)
- `docs/standards/edge-cases/work-item-folders.md` (WORKITEM-02: a plan with unexecuted steps is not filed as completed)
