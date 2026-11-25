import { lazy, Suspense, type ReactElement, type ReactNode } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from '../components/layout/AppLayout';
import { ForgotPasswordPage, ResetPasswordPage } from '../features/auth/PasswordPages';
import { LoginPage } from '../features/auth/LoginPage';
import { ProtectedRoute, PublicOnlyRoute } from '../features/auth/ProtectedRoute';
import { WelcomePage } from '../features/dashboard/WelcomePage';
import { LoadingState } from '../components/common/States';
import { HomePage } from '../features/shell/HomePage';
import { NotFoundPage } from '../features/shell/NotFoundPage';
import { permissions } from '../lib/permissions/permission-registry';

const DashboardPage = lazy(() =>
  import('../features/dashboard/DashboardPage').then((module) => ({
    default: module.DashboardPage,
  })),
);
const ProductCatalogPage = lazy(() =>
  import('../features/products/ProductCatalogPage').then((module) => ({
    default: module.ProductCatalogPage,
  })),
);
const ProductDetailPage = lazy(() =>
  import('../features/products/ProductDetailPage').then((module) => ({
    default: module.ProductDetailPage,
  })),
);
const CategoryPage = lazy(() =>
  import('../features/products/CategoryPage').then((module) => ({ default: module.CategoryPage })),
);
const CustomerListPage = lazy(() =>
  import('../features/customers/CustomerListPage').then((module) => ({
    default: module.CustomerListPage,
  })),
);
const CustomerDetailPage = lazy(() =>
  import('../features/customers/CustomerDetailPage').then((module) => ({
    default: module.CustomerDetailPage,
  })),
);
const SupplierListPage = lazy(() =>
  import('../features/suppliers/SupplierListPage').then((module) => ({
    default: module.SupplierListPage,
  })),
);
const SupplierDetailPage = lazy(() =>
  import('../features/suppliers/SupplierDetailPage').then((module) => ({
    default: module.SupplierDetailPage,
  })),
);
const SellerListPage = lazy(() =>
  import('../features/suppliers/SellerListPage').then((module) => ({
    default: module.SellerListPage,
  })),
);
const SellerDetailPage = lazy(() =>
  import('../features/suppliers/SellerDetailPage').then((module) => ({
    default: module.SellerDetailPage,
  })),
);
const PackagingPage = lazy(() =>
  import('../features/fulfillment/PackagingPage').then((module) => ({
    default: module.PackagingPage,
  })),
);
const DeliveryPage = lazy(() =>
  import('../features/fulfillment/DeliveryPage').then((module) => ({
    default: module.DeliveryPage,
  })),
);
const PackingSlipPage = lazy(() =>
  import('../features/fulfillment/PackingSlipPage').then((module) => ({
    default: module.PackingSlipPage,
  })),
);
const ReturnsListPage = lazy(() =>
  import('../features/returns/ReturnsListPage').then((module) => ({
    default: module.ReturnsListPage,
  })),
);
const CreateReturnPage = lazy(() =>
  import('../features/returns/CreateReturnPage').then((module) => ({
    default: module.CreateReturnPage,
  })),
);
const ReturnDetailPage = lazy(() =>
  import('../features/returns/ReturnDetailPage').then((module) => ({
    default: module.ReturnDetailPage,
  })),
);
const NewSalePage = lazy(() =>
  import('../features/sales/NewSalePage').then((module) => ({ default: module.NewSalePage })),
);
const SalesHistoryPage = lazy(() =>
  import('../features/sales/SalesHistoryPage').then((module) => ({
    default: module.SalesHistoryPage,
  })),
);
const SaleDetailPage = lazy(() =>
  import('../features/sales/SaleDetailPage').then((module) => ({ default: module.SaleDetailPage })),
);
const ReceiptPage = lazy(() =>
  import('../features/sales/ReceiptPage').then((module) => ({ default: module.ReceiptPage })),
);
const CommunicationsPage = lazy(() =>
  import('../features/communications/CommunicationsPage').then((module) => ({
    default: module.CommunicationsPage,
  })),
);
const OperationsPage = lazy(() =>
  import('../features/shell/OperationsPage').then((module) => ({
    default: module.OperationsPage,
  })),
);
const SettingsPage = lazy(() =>
  import('../features/settings/SettingsPage').then((module) => ({ default: module.SettingsPage })),
);
const UsersPage = lazy(() =>
  import('../features/settings/UsersPage').then((module) => ({ default: module.UsersPage })),
);
const AuditLogsPage = lazy(() =>
  import('../features/settings/AuditLogsPage').then((module) => ({
    default: module.AuditLogsPage,
  })),
);

function routeElement(element: ReactNode, label: string): ReactElement {
  return <Suspense fallback={<LoadingState label={label} />}>{element}</Suspense>;
}


export const router = createBrowserRouter([
  { path: '/', element: <WelcomePage /> },
  {
    path: '/login',
    element: (
      <PublicOnlyRoute>
        <LoginPage />
      </PublicOnlyRoute>
    ),
  },
  {
    path: '/forgot-password',
    element: (
      <PublicOnlyRoute>
        <ForgotPasswordPage />
      </PublicOnlyRoute>
    ),
  },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  {
    path: '/app',
    element: (
      <ProtectedRoute permission={permissions.workspaceView}>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <HomePage /> },
      {
        path: 'dashboard',
        element: routeElement(<DashboardPage />, 'Loading dashboard'),
      },
      { path: 'products', element: routeElement(<ProductCatalogPage />, 'Loading products') },
      { path: 'products/:id', element: routeElement(<ProductDetailPage />, 'Loading product') },
      { path: 'categories', element: routeElement(<CategoryPage />, 'Loading categories') },
      {
        path: 'inventory',
        element: routeElement(<ProductCatalogPage lowStockOnly />, 'Loading inventory'),
      },
      { path: 'customers', element: routeElement(<CustomerListPage />, 'Loading customers') },
      { path: 'customers/:id', element: routeElement(<CustomerDetailPage />, 'Loading customer') },
      { path: 'suppliers', element: routeElement(<SupplierListPage />, 'Loading suppliers') },
      { path: 'suppliers/:id', element: routeElement(<SupplierDetailPage />, 'Loading supplier') },
      { path: 'sellers', element: routeElement(<SellerListPage />, 'Loading sellers') },
      { path: 'sellers/:id', element: routeElement(<SellerDetailPage />, 'Loading seller') },
      { path: 'sales/new', element: routeElement(<NewSalePage />, 'Loading sale workspace') },
      {
        path: 'sales/history',
        element: routeElement(<SalesHistoryPage />, 'Loading sales history'),
      },
      { path: 'sales/:id', element: routeElement(<SaleDetailPage />, 'Loading sale') },
      { path: 'sales/:id/receipt', element: routeElement(<ReceiptPage />, 'Loading receipt') },
      { path: 'packaging', element: routeElement(<PackagingPage />, 'Loading packaging') },
      { path: 'delivery', element: routeElement(<DeliveryPage />, 'Loading deliveries') },
      {
        path: 'deliveries/:saleId/packing-slip',
        element: routeElement(<PackingSlipPage />, 'Loading packing slip'),
      },
      {
        path: 'packaging/:saleId/slip',
        element: routeElement(<PackingSlipPage />, 'Loading packing slip'),
      },
      { path: 'payments', element: routeElement(<OperationsPage section="payments" />, 'Loading payments') },
      { path: 'returns', element: routeElement(<ReturnsListPage />, 'Loading returns') },
      { path: 'returns/new', element: routeElement(<CreateReturnPage />, 'Loading return form') },
      { path: 'returns/:id', element: routeElement(<ReturnDetailPage />, 'Loading return') },
      { path: 'costs', element: routeElement(<OperationsPage section="costs" />, 'Loading operational costs') },
      { path: 'accounting', element: routeElement(<OperationsPage section="accounting" />, 'Loading accounting') },
      { path: 'reports', element: routeElement(<OperationsPage section="reports" />, 'Loading reports') },
      { path: 'reports/products', element: routeElement(<OperationsPage section="investments" />, 'Loading product performance') },
      {
        path: 'communications',
        element: routeElement(<CommunicationsPage />, 'Loading communications'),
      },
      { path: 'crm', element: routeElement(<OperationsPage section="crm" />, 'Loading CRM') },
      { path: 'investments', element: routeElement(<OperationsPage section="investments" />, 'Loading investments') },
      {
        path: 'users',
        element: (
          <ProtectedRoute permission={permissions.usersView}>
            {routeElement(<UsersPage />, 'Loading user administration')}
          </ProtectedRoute>
        ),
      },
      {
        path: 'settings',
        element: (
          <ProtectedRoute permission={permissions.settingsView}>
            {routeElement(<SettingsPage />, 'Loading organization settings')}
          </ProtectedRoute>
        ),
      },
      {
        path: 'audit-logs',
        element: (
          <ProtectedRoute permission={permissions.auditLogsView}>
            {routeElement(<AuditLogsPage />, 'Loading audit history')}
          </ProtectedRoute>
        ),
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
