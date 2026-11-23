import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from '../components/layout/AppLayout';
import { ForgotPasswordPage, ResetPasswordPage } from '../features/auth/PasswordPages';
import { LoginPage } from '../features/auth/LoginPage';
import { ProtectedRoute, PublicOnlyRoute } from '../features/auth/ProtectedRoute';
import { WelcomePage } from '../features/dashboard/WelcomePage';
import { LoadingState } from '../components/common/States';
import { HomePage } from '../features/shell/HomePage';
import { NotFoundPage } from '../features/shell/NotFoundPage';
import { PlaceholderPage } from '../features/shell/PlaceholderPage';
import { ProductCatalogPage } from '../features/products/ProductCatalogPage';
import { ProductDetailPage } from '../features/products/ProductDetailPage';
import { CategoryPage } from '../features/products/CategoryPage';
import { CustomerListPage } from '../features/customers/CustomerListPage';
import { CustomerDetailPage } from '../features/customers/CustomerDetailPage';
import { SupplierListPage } from '../features/suppliers/SupplierListPage';
import { SupplierDetailPage } from '../features/suppliers/SupplierDetailPage';
import { SellerListPage } from '../features/suppliers/SellerListPage';
import { SellerDetailPage } from '../features/suppliers/SellerDetailPage';
import { permissions } from '../lib/permissions/permission-registry';

const DashboardPage = lazy(() =>
  import('../features/dashboard/DashboardPage').then((module) => ({
    default: module.DashboardPage,
  })),
);

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
        element: (
          <Suspense fallback={<LoadingState label="Loading dashboard" />}>
            <DashboardPage />
          </Suspense>
        ),
      },
      { path: 'products', element: <ProductCatalogPage /> },
      { path: 'products/:id', element: <ProductDetailPage /> },
      { path: 'categories', element: <CategoryPage /> },
      { path: 'inventory', element: <ProductCatalogPage lowStockOnly /> },
      { path: 'customers', element: <CustomerListPage /> },
      { path: 'customers/:id', element: <CustomerDetailPage /> },
      { path: 'suppliers', element: <SupplierListPage /> },
      { path: 'suppliers/:id', element: <SupplierDetailPage /> },
      { path: 'sellers', element: <SellerListPage /> },
      { path: 'sellers/:id', element: <SellerDetailPage /> },
      { path: 'sales/new', element: <PlaceholderPage /> },
      { path: 'sales/history', element: <PlaceholderPage /> },
      { path: 'packaging', element: <PlaceholderPage /> },
      { path: 'delivery', element: <PlaceholderPage /> },
      { path: 'payments', element: <PlaceholderPage /> },
      { path: 'returns', element: <PlaceholderPage /> },
      { path: 'costs', element: <PlaceholderPage /> },
      { path: 'accounting', element: <PlaceholderPage /> },
      { path: 'reports', element: <PlaceholderPage /> },
      { path: 'reports/products', element: <PlaceholderPage /> },
      { path: 'communications', element: <PlaceholderPage /> },
      { path: 'crm', element: <PlaceholderPage /> },
      { path: 'investments', element: <PlaceholderPage /> },
      { path: 'users', element: <PlaceholderPage /> },
      { path: 'settings', element: <PlaceholderPage /> },
      { path: 'audit-logs', element: <PlaceholderPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
