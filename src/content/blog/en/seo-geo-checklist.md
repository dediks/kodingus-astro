---
title: "The SEO & GEO Checklist I Actually Use When Building Sites"
description: "A practical, phase-by-phase checklist covering technical SEO, Core Web Vitals, AI optimization, schema markup, and post-launch indexing — written by a developer, for developers."
pubDate: 2026-07-11
tags: ["seo", "geo", "web-development", "performance", "core-web-vitals"]
---

SEO has this reputation for being mysterious — like there's some secret formula that only marketing people understand. In practice, most of it comes down to building your site correctly from the start and making sure Google can actually read what you built. That's it.

This checklist is what I go through whenever I'm shipping a site. It's split into four stages: decisions you make before writing a single line of code, things you handle during development, the newer stuff around AI-generated search results, and finally what to do after you launch. Skip a stage and you'll probably be fine short-term, but you'll pay for it later.

---

## Before You Write Any Code

The decisions here are the ones that are painful to undo. Get them wrong and you're looking at redirects, refactors, and URL migrations six months down the road.

**HTTPS is non-negotiable.** Google has been using HTTPS as a ranking signal for years, and browsers now actively warn users on HTTP sites. Get a certificate from Let's Encrypt (it's free), and once you have it, add an HSTS header so browsers stop even trying plain HTTP:

```
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

Then check your browser console for mixed-content warnings — those will bite you later.

**Design for mobile first, not as an afterthought.** Google crawls your mobile version and uses it for ranking. This doesn't mean just "make it responsive." It means your smallest viewport should be your primary design target. A layout that works at 375px wide and then scales up is going to serve you much better than a desktop design squeezed down. Use Chrome DevTools device mode during development, not just at the end.

**Keep your URLs clean.** This sounds obvious but it's amazing how often it gets ignored. Short, lowercase, hyphens between words, no query parameters for permanent content pages. Compare `/blog/core-web-vitals-guide` against `/page?id=482&category=technical-seo` — one of those tells the user and Google something useful, the other tells them nothing. Once you pick a URL structure, stick with it. Changing URLs later means setting up redirects, which means lost link equity, which means a rankings dip.

**Every important page should be reachable in three clicks or fewer from your homepage.** This isn't a hard rule from Google, it's just practical: if a page is buried six levels deep, crawlers visit it infrequently and users rarely find it. Sketch out your site structure before building. Add breadcrumbs too — they help both crawlers and actual humans understand where they are.

---

## Technical SEO While You're Building

This is where most developers either build a really solid foundation or accidentally create a mess they don't notice for months.

**One `<h1>` per page.** One. That's the page title. Your `<h2>` tags should cover the main topics, `<h3>` covers sub-topics under those, and so on. Never jump from `<h1>` straight to `<h3>` — screen readers and search engines use heading structure the same way readers skim a document. If your heading hierarchy is broken, your content is harder to understand for both.

**Meta tags that actually work.** Every page needs a unique `<title>` (under 60 characters, or it gets cut off in search results) and a `<meta description>` (under 155 characters). The description doesn't directly affect your ranking, but it's what people see in search results before clicking. Write it like it needs to earn a click, not just summarize the page.

```html
<title>Core Web Vitals Explained for Developers (2026) | Kodingus</title>
<meta name="description" content="LCP, INP, and CLS explained with real causes and fixes — the stuff PageSpeed Insights actually flags on production sites." />
```

**Canonical tags on every page.** If your site can be reached at both `https://example.com/blog/post` and `https://example.com/blog/post/`, or with and without `www`, search engines might treat those as separate pages and split your ranking signals. A canonical tag tells Google which version is the real one:

```html
<link rel="canonical" href="https://example.com/blog/post" />
```

Put this in `<head>` on every page. Automated — don't think about it per-page.

**Images are usually the biggest performance problem on any page.** The defaults are terrible. Here's what actually makes a difference:

- Use WebP or AVIF instead of JPEG/PNG. WebP is about 30% smaller for similar quality and works in every browser worth caring about.
- Compress before uploading. Tools like Squoosh or Sharp do this well. Aim for under 100 KB for most images.
- Always include descriptive `alt` text. Not just for accessibility (though that matters) — search engines use it to understand what an image shows.
- Add `loading="lazy"` to every image that isn't in the first screen of content. It's one attribute and it meaningfully speeds up initial load.

**Core Web Vitals are real ranking signals, not suggestions.** Google measures three things:

| Metric | What it actually measures | Target |
|---|---|---|
| LCP (Largest Contentful Paint) | How fast the main content loads | Under 2.5 seconds |
| INP (Interaction to Next Paint) | How fast the page responds to user input | Under 200ms |
| CLS (Cumulative Layout Shift) | Whether content jumps around while loading | Under 0.1 |

The most common culprits: slow LCP is usually a large unoptimized hero image or slow server response. High INP is usually too much JavaScript running on the main thread. CLS is almost always images without explicit width/height attributes, or content that loads in late and pushes other things down.

Measure with PageSpeed Insights before launch, and check the Core Web Vitals report in Google Search Console for real-user data after.

---

## Making Your Content Work with AI Search (GEO)

This is newer territory. Beyond just ranking in the ten blue links, content now needs to be understandable enough for AI systems — Google AI Overviews, Perplexity, ChatGPT — to pull from it accurately. The term "GEO" (Generative Engine Optimization) is starting to catch on for this. The underlying idea is pretty straightforward: write clearly, structure your data, and demonstrate that you know what you're talking about.

**Schema markup tells AI what your content is, not just what it says.** Add JSON-LD structured data in a script tag in your page head. For blog posts, Article schema is the baseline:

```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "Your Post Title",
  "author": { "@type": "Person", "name": "Your Name" },
  "datePublished": "2026-07-11",
  "publisher": {
    "@type": "Organization",
    "name": "Kodingus",
    "url": "https://kodingus.com"
  }
}
```

For FAQ-style content, FAQPage schema significantly improves your chances of appearing in AI Overviews:

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [{
    "@type": "Question",
    "name": "What is GEO in SEO?",
    "acceptedAnswer": {
      "@type": "Answer",
      "text": "GEO stands for Generative Engine Optimization — the practice of writing and structuring content so AI systems can accurately extract and cite it."
    }
  }]
}
```

**Structure your content like you're answering questions.** AI Overviews and featured snippets almost always pull from pages where a heading frames a question and the first paragraph directly answers it. If your `<h2>` is "What is Core Web Vitals?" and your next two sentences give a complete answer, that's what gets extracted. If instead your heading is "Performance" and the next paragraph is a vague intro, nothing useful gets pulled.

**E-E-A-T matters more than it used to.** Experience, Expertise, Authoritativeness, Trustworthiness — Google uses this framework to evaluate content quality, especially for anything touching health, money, or decisions. In practice: write author bios, link to your sources, have a contact page and privacy policy, and don't make claims you can't back up. It sounds basic, but a lot of developer blogs skip this entirely.

**Use real HTML structure for important content.** Lists, tables, numbered steps — these should be actual `<ul>`, `<ol>`, and `<table>` elements, not divs styled to look like them. Both search crawlers and AI systems parse structured HTML much more reliably than a wall of text. Avoid putting critical information inside JavaScript-rendered content; many crawlers won't execute your scripts.

---

## After Launch: Getting Indexed

You can do everything else right and still have a site that Google can't find or won't index. This last phase is about making sure that doesn't happen.

**Check your `robots.txt` before anything else.** This file lives at `https://yourdomain.com/robots.txt` and tells crawlers what they can access. The most common mistake I see is a staging environment's `robots.txt` accidentally deployed to production with `Disallow: /` — which blocks Google from your entire site. Open it, read it, make sure it looks like this in production:

```
User-agent: *
Disallow:

Sitemap: https://yourdomain.com/sitemap.xml
```

**Generate a clean XML sitemap.** Include only the pages that return HTTP 200 and actually contain useful content. No 404s, no redirects, no admin pages. If you're using Astro, the `@astrojs/sitemap` integration handles this automatically. Submit the sitemap URL in Google Search Console under the Sitemaps section.

**Internal linking is more important than most people realize.** It's how Google discovers new pages and how "link authority" flows through your site. The anchor text matters too — "read the Core Web Vitals guide" is more useful to Google than "click here." Every page you publish should be linked to from at least one other page, preferably from something that gets real traffic.

**Google Search Console is your post-launch home base.** Once you've verified domain ownership (the DNS TXT record method is the most reliable), submit your sitemap and start using the URL Inspection tool. For any page you publish or significantly update, request indexing manually — don't wait for the next scheduled crawl, which can take days or weeks. Check the Coverage report regularly for pages that got excluded or errored, and watch the Core Web Vitals report for real-user performance data that Lighthouse can't show you.

---

## The Quick Checklist

For copy-pasting into your project tracker:

**Before dev**
- [ ] SSL installed, HSTS header set
- [ ] Mobile-first layout verified at 375px
- [ ] URL structure decided: lowercase, hyphens, no unnecessary params
- [ ] Site hierarchy mapped, max 3 clicks from homepage, breadcrumbs planned

**During dev**
- [ ] One `<h1>` per page, sequential heading hierarchy
- [ ] Unique title (≤60 chars) and meta description (≤155 chars) on every page
- [ ] Canonical tag in `<head>` on every page
- [ ] Images: WebP/AVIF, compressed under 100 KB, descriptive alt text, lazy loading
- [ ] LCP under 2.5s, INP under 200ms, CLS under 0.1

**GEO**
- [ ] JSON-LD schema (Article, FAQPage as applicable)
- [ ] Headings framed as questions where content answers them
- [ ] Author bio present, contact and privacy pages exist
- [ ] Key data in proper HTML: `<ul>`, `<ol>`, `<table>`

**Post-launch**
- [ ] `robots.txt` allows all crawlers in production
- [ ] Sitemap generated with HTTP 200 URLs only, submitted in GSC
- [ ] Internal links use descriptive anchor text
- [ ] Domain verified in GSC, indexing requested for new pages

---

None of this is magic. It's just being deliberate about how you build things. The sites that consistently outrank competitors aren't doing anything exotic — they're doing these fundamentals well, consistently, over time.
