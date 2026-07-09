---
title: "EventTuban"
description: "Full-stack local event directory & management platform built with Laravel 12 and React 19 — featuring public event discovery, community submissions, TikTok OAuth import, Telegram notifications, and an admin curation panel."
pubDate: 2025-07-01
tags: ["Laravel 12", "React 19", "TypeScript", "Inertia.js", "Tailwind CSS v4", "Shadcn/UI", "TikTok API", "Telegram API", "Vite 7"]
link: "https://eventtuban.web.id"
---

EventTuban is a full-stack web platform for aggregating and showcasing local events in a structured directory. Built for the Tuban community in East Java, it bridges the gap between event organizers and the public — making local events easier to discover, submit, and manage.

## Architecture

The platform uses the **Inertia.js SPA pattern**, pairing **Laravel 12** on the backend with **React 19 + TypeScript** on the frontend. This eliminates the need for a separate REST API while delivering a fast, single-page app experience. The UI is built entirely with **Shadcn/UI** components on top of **Tailwind CSS v4**, resulting in a polished and fully responsive interface.

## Key Features

- **Public event directory** — browse events by category, date, and location
- **Community submission workflow** — organizers submit events for admin review before going live
- **Admin curation & moderation panel** — full control over published content
- **TikTok OAuth 2.0 integration** — import TikTok videos directly as event entries
- **Telegram Bot notifications** — automated alerts sent to Telegram channels/groups when new events are published or submissions need review
- **Hierarchical categories & subcategories** — structured event taxonomy
- **Tagging system** — flexible cross-category labeling
- **Dynamic sitemap generation** — auto-generated XML sitemap for SEO
- **Monthly event statistics** — insights into event trends over time
- **Rich text editor** — Quill.js with DOMPurify sanitization for safe content

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Laravel 12, PHP 8.2, Inertia.js |
| Frontend | React 19, TypeScript, Tailwind CSS v4 |
| UI Components | Shadcn/UI, Radix UI, Lucide Icons |
| Build Tool | Vite 7 |
| Database | SQLite / MySQL |
| Testing | Pest PHP |
| Integration | TikTok API (OAuth 2.0), Telegram Bot API |
| Rich Text | Quill.js, DOMPurify |

