import {
  BarChart3,
  Boxes,
  ClipboardList,
  CreditCard,
  FileBarChart,
  HandCoins,
  LayoutDashboard,
  Mail,
  PackageCheck,
  Receipt,
  Settings,
  ShoppingCart,
  Truck,
  UserRound,
  Users,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';
import type { AuthRole } from '../../features/auth/auth-store.js';
import { permissions, type Permission } from './permission-registry.js';
import { hasPermission } from './permission-utils.js';

export type NavigationItem = {
  label: string;
  path: string;
  permission: Permission;
  icon: LucideIcon;
  implemented: boolean;
};
export type NavigationGroup = { label: string; items: readonly NavigationItem[] };

const item = (
  label: string,
  path: string,
  permission: Permission,
  icon: LucideIcon,
): NavigationItem => ({ label, path, permission, icon, implemented: false });

export const navigationGroups: readonly NavigationGroup[] = [
  {
    label: 'Overview',
    items: [
      {
        ...item('Dashboard', '/app/dashboard', permissions.dashboardView, LayoutDashboard),
        implemented: true,
      },
    ],
  },
  {
    label: 'Inventory',
    items: [
      { ...item('Products', '/app/products', permissions.productsView, Boxes), implemented: true },
      {
        ...item('Categories', '/app/categories', permissions.productsView, ClipboardList),
        implemented: true,
      },
      {
        ...item('Stock Management', '/app/inventory', permissions.productsStockAdjust, Warehouse),
        implemented: true,
      },
    ],
  },
  {
    label: 'Relationships',
    items: [
      {
        ...item('Customers', '/app/customers', permissions.customersView, UserRound),
        implemented: true,
      },
      {
        ...item('Suppliers', '/app/suppliers', permissions.suppliersView, Truck),
        implemented: true,
      },
      { ...item('Sellers', '/app/sellers', permissions.sellersView, Users), implemented: true },
    ],
  },
  {
    label: 'Sales & Fulfillment',
    items: [
      {
        ...item('New Sale', '/app/sales/new', permissions.salesCreate, ShoppingCart),
        implemented: true,
      },
      {
        ...item('Sales History', '/app/sales/history', permissions.salesView, Receipt),
        implemented: true,
      },
      {
        ...item('Packaging', '/app/packaging', permissions.packagingView, PackageCheck),
        implemented: true,
      },
      {
        ...item('Delivery', '/app/delivery', permissions.deliveryView, Truck),
        implemented: true,
      },
    ],
  },
  {
    label: 'Finance',
    items: [
      item('Payments', '/app/payments', permissions.paymentsView, CreditCard),
      {
        ...item('Returns & Refunds', '/app/returns', permissions.returnsView, Receipt),
        implemented: true,
      },
      item('Operational Costs', '/app/costs', permissions.accountingManage, HandCoins),
      item('Accounting', '/app/accounting', permissions.accountingView, FileBarChart),
    ],
  },
  {
    label: 'Business Intelligence',
    items: [
      item('Reports', '/app/reports', permissions.reportsView, BarChart3),
      item('Product Performance', '/app/reports/products', permissions.reportsView, BarChart3),
    ],
  },
  {
    label: 'Communications',
    items: [
      {
        ...item('SMS & Email', '/app/communications', permissions.communicationsView, Mail),
        implemented: true,
      },
    ],
  },
  {
    label: 'Management',
    items: [
      item('CRM & Loyalty', '/app/crm', permissions.crmView, Users),
      item('Investments', '/app/investments', permissions.investmentsView, HandCoins),
      { ...item('User Management', '/app/users', permissions.usersView, Users), implemented: true },
      { ...item('Settings', '/app/settings', permissions.settingsView, Settings), implemented: true },
      { ...item('Audit Logs', '/app/audit-logs', permissions.auditLogsView, ClipboardList), implemented: true },
    ],
  },
];

export function getAuthorizedNavigation(role: AuthRole | undefined): NavigationGroup[] {
  return navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((navigationItem) => hasPermission(role, navigationItem.permission)),
    }))
    .filter((group) => group.items.length > 0);
}
