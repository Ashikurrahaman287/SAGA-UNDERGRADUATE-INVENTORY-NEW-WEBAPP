# Frontend Design System

## Principles

SAGA uses a quiet, high-signal enterprise interface: strong hierarchy, predictable navigation, compact controls, accessible contrast, and restrained motion. Business modules should use the shared shell and page primitives rather than introduce local layout systems. Future records and workflows must not be represented as fake data in the foundation.

## Tokens

Tokens live in `src/styles/design-tokens.css` and use a navy sidebar, blue action color, slate neutrals, and explicit success/warning/danger colors:

- Page: `#f8fafc`
- Sidebar: `#172554`
- Primary: `#2563eb`
- Primary soft: `#eff6ff`
- Ink: `#0f172a`
- Muted: `#64748b`
- Border: `#e2e8f0`
- Success/warning/danger: `#16a34a`, `#d97706`, `#dc2626`

Typography uses the existing readable Aptos/Segoe UI family, with compact uppercase labels and strong page titles. Controls use consistent rounded corners, visible focus rings, and touch-friendly padding.

## Components

- `AppLayout`: authenticated responsive frame and direct-route permission boundary.
- `Sidebar`: grouped role-filtered navigation, desktop collapse, mobile drawer, and non-sensitive collapse preference.
- `Header`: breadcrumbs, notification foundation, verified user/organization context, and sign-out menu.
- `PageContainer`, `PageHeader`, `PageSection`, `PageToolbar`: reusable page composition primitives.
- `States`: loading, empty, error, unauthorized, not-found, and ready states.
- `PermissionGuard` and `RoleGuard`: presentation guards backed by the centralized Task 04 registry.

## Navigation

Navigation is configured in `src/lib/permissions/navigation.ts` and filtered through `hasPermission`. Admin sees all enabled placeholder routes, Moderator sees operational routes, and Rider sees Delivery only. Placeholder destinations are visibly labeled as foundation previews and do not claim to implement business operations. Only the workspace home is currently functional.

## Responsive behavior

Desktop uses a 264px sidebar with a 76px collapsed mode. On smaller screens the sidebar becomes a drawer with an overlay; the header exposes a menu button and keeps account actions available. The Rider role receives the smallest navigation surface and large touch targets. The login and shell were smoke-tested at desktop and 390px mobile widths with no horizontal overflow.

## Accessibility

Use semantic landmarks, labelled icon buttons, keyboard-operable controls, visible focus styles, radio groups for role selection, status text for errors, and links/buttons that describe their action. Tooltips use native `title` text when the sidebar is collapsed. Future dialogs and menus must manage focus and close on Escape.

## Performance

The shell keeps module pages as small route components and uses the existing Vite chunking boundary. Future heavy business modules should be lazy-loaded at route boundaries. No new UI dependency was added for Task 05; Lucide and the existing Tailwind/shadcn-compatible primitives are reused.
