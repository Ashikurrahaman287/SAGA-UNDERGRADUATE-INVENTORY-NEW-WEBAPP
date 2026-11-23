# SAGA Inventory Management System

SAGA is a production-oriented inventory and business operations platform for Admin, Moderator, and Rider workflows. Task 01 establishes the application foundation only; business modules, database tables, authentication policies, and RLS are intentionally deferred to later tasks.

## Stack

React, Vite, TypeScript, Tailwind CSS, shadcn/ui-compatible components, Lucide React, React Router, TanStack Query, React Hook Form, Zod, Supabase, Vercel Functions, Vitest, React Testing Library, and Playwright.

## Getting Started

```bash
npm install
copy .env.example .env.local
npm run dev
```

Available scripts: `npm run dev`, `npm run build`, `npm run preview`, `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run format:check`.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Environment](docs/ENVIRONMENT.md)
- [Development](docs/DEVELOPMENT.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Authentication](docs/AUTHENTICATION.md)
- [Authorization](docs/AUTHORIZATION.md)
- [Frontend design system](docs/FRONTEND_DESIGN_SYSTEM.md)
- [Admin dashboard](docs/ADMIN_DASHBOARD.md)
- [Products and inventory](docs/PRODUCTS_AND_INVENTORY.md)
- [Customers management](docs/CUSTOMERS_MANAGEMENT.md)
- [Suppliers and sellers](docs/SUPPLIERS_AND_SELLERS.md)

## Foundation endpoints

- `GET /api/health` reports process health and a request ID.
- `GET /api/ready` reports whether required server configuration is present. It does not claim database connectivity.
