# SAGA Inventory

SAGA Inventory is a web-based inventory and operations system for small teams. It supports organization-scoped Admin, Moderator, and Rider workflows.

## Features

- Product catalog, categories, stock adjustments, and low-stock reporting
- Customer, supplier, and seller records
- Sales, receipts, outstanding balances, and payment collection
- Packaging and delivery workflows, including rescheduling and cancellation
- Returns, operational costs, reports, and dashboard summaries
- Role-based access, audit history, and transactional email/SMS integrations

## Technology

React, TypeScript, Vite, Tailwind CSS, Supabase Auth and PostgreSQL, Vercel Functions, Vitest, React Testing Library, and Playwright.

## Local Development

Requirements: Node.js 22 or newer and npm. A configured Supabase project is required for sign-in and database-backed features. See [Local Setup](LOCAL_SETUP.md) for organization, Auth, and provider configuration.

```powershell
npm install
Copy-Item .env.example .env
```

Run the API and frontend in separate terminals:

```powershell
npm run dev:api
```

```powershell
npm run dev
```

The frontend runs at `http://localhost:5173` and proxies `/api/*` to the local API at `http://127.0.0.1:3000`.

## Checks

```bash
npm run lint
npm run typecheck
npm run typecheck:api
npm test
npm run build
npm run test:smoke
```

## Deployment

Deploy from the repository root using the Vite preset on Vercel. Configure server-only environment variables in the deployment platform; never place service-role or provider credentials in `VITE_*` variables. Review [Deployment](docs/DEPLOYMENT.md), [Environment](docs/ENVIRONMENT.md), and the [Vercel release checklist](docs/VERCEL_DEPLOYMENT.md) before launch.

The included tests and local checks do not replace staging verification of RLS, tenant boundaries, provider delivery, backups, and deployed authentication.

## License

This project is released under the [MIT License](LICENSE).

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Environment](docs/ENVIRONMENT.md)
- [Development](docs/DEVELOPMENT.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Vercel production release gate](docs/VERCEL_DEPLOYMENT.md)
- [Production readiness report](docs/PRODUCTION_READINESS_REPORT.md)
- [Authentication](docs/AUTHENTICATION.md)
- [Authorization](docs/AUTHORIZATION.md)
- [Frontend design system](docs/FRONTEND_DESIGN_SYSTEM.md)
- [Admin dashboard](docs/ADMIN_DASHBOARD.md)
- [Products and inventory](docs/PRODUCTS_AND_INVENTORY.md)
- [Customers management](docs/CUSTOMERS_MANAGEMENT.md)
- [Suppliers and sellers](docs/SUPPLIERS_AND_SELLERS.md)
- [Sales creation](docs/SALES_CREATION.md)
- [Sales history](docs/SALES_HISTORY.md)
- [Packaging and fulfillment](docs/PACKAGING_FULFILLMENT.md)
- [Returns and refunds](docs/RETURNS_REFUNDS.md)
- [Communications](docs/COMMUNICATIONS.md)
- [Settings, user administration, and audit](docs/SETTINGS_ADMIN_AUDIT.md)
- [Project status](docs/PROJECT_STATUS.md)
- [Production readiness](docs/PRODUCTION_READINESS_REPORT.md)
- [Local Supabase and frontend setup](LOCAL_SETUP.md)

## Health endpoints

- `GET /api/health` reports process health and a request ID.
- `GET /api/ready` verifies required server configuration and database connectivity without returning connection details.
