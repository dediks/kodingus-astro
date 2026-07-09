---
title: "Bejagung — Community Management Platform"
description: "Full-stack web platform for village community management — covering RT administration, prayer group finances, haul genealogy, and local UMKM profiles in one unified multi-tenant system."
pubDate: 2025-06-01
tags: ["Laravel 12", "React 19", "TypeScript", "Inertia.js", "Multi-tenant", "WebSocket", "PWA", "RBAC", "Tailwind CSS v4"]
link: "https://bejagung.web.id"
---

Everything used to be recorded in handwritten notebooks. **bejagung.web.id** was born from a real need: designing and building a unified web platform now used to manage RT residents, prayer group finances, haul genealogy data, and local UMKM business profiles — all in one system with a multi-tenant architecture.

## Architecture

Built on the **Inertia.js SPA pattern** — Laravel 12 on the backend paired with React 19 + TypeScript on the frontend, with no separate REST API. On top of this sits a multi-tenant system supporting **three data isolation strategies** (shared table, separate database, schema) within a single codebase, without changing business logic across models.

The hardest technical challenge: designing a financial system where data **cannot be deleted**. Every correction generates a void + reversal entry — preserving full data integrity and audit trail, following professional accounting standards.

## Highlights

- 🏗️ **Multi-tenant** — one codebase, three data isolation strategies (shared table / separate database / schema)
- 📒 **Immutable financial ledger** — corrections via void-reversal, never delete, full audit trail
- ⚡ **Real-time** — WebSocket powered by Laravel Reverb, no paid third-party services
- 🔐 **Granular RBAC** — per-feature permissions using Spatie Laravel Permission
- 📱 **PWA** — browser push notifications, offline mode, installable

## Modules

| Module | Function |
|---|---|
| **RT** | Resident records, announcements, dues, community programs |
| **Nariyah** | Prayer attendance, dues, auditable cash ledger, arisan |
| **Haul** | Family genealogy tree, haul donations, data moderation |
| **UMKM** | Local business landing pages per tenant |

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Laravel 12, PHP 8.2, Inertia.js |
| Frontend | React 19, TypeScript, Tailwind CSS v4 |
| UI Components | Radix UI, Lucide Icons |
| Real-time | Laravel Reverb (WebSocket) |
| Auth & Access | Spatie Laravel Permission (RBAC) |
| Multi-tenancy | Custom (shared table / DB / schema) |
| Build Tool | Vite |
| Progressive Web App | PWA, push notifications, offline mode |


