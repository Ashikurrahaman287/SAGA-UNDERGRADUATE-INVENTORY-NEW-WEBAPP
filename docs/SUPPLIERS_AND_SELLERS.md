# Suppliers and Sellers

## Scope

Supplier and seller/operator records are managed in separate Admin-only modules. Suppliers use the `suppliers` entity and its `products.supplier_id` relationship. Sellers use the `sellers` entity and `sales.seller_id` relationship. Sellers are business records, not authentication identities or membership roles.

## Data model

Migration 018 adds supplier alternative phone, city, website, reference code, and audit actor fields. Sellers gain reference code, address, notes, and audit actor fields. Organization-scoped partial unique indexes protect supplier and seller reference codes. Existing composite product/supplier and sale/seller foreign keys preserve tenant isolation and historical relationships.

Supplier archival changes `is_active` without deleting linked products. The product database trigger rejects new assignments to archived suppliers while allowing existing links to remain readable. Seller archival likewise preserves historical sale attribution.

## API endpoints

### Suppliers

- `GET/POST /api/suppliers`
- `GET/PATCH/POST /api/suppliers/:id`
- `GET /api/suppliers/:id/products`

### Sellers/operators

- `GET/POST /api/sellers`
- `GET/PATCH/POST /api/sellers/:id`
- `GET /api/sellers/:id/sales`

Every endpoint requires the centralized Admin-only supplier/seller permission, derives organization from the verified membership, validates input, and returns safe responses. Lists aggregate linked product/sale counts in PostgreSQL. No service-role key is exposed.

## Sales integration contract

Sales contains a nullable `seller_id` with an organization-safe foreign key. The New Sale workflow accepts an optional active seller, and the transaction RPC validates and stores the relationship for historical reporting. Seller sales queries exclude cancelled sales and avoid joins that would duplicate totals.

## Authorization and RLS

Existing Supplier and Seller RLS policies are Admin-only. The permission registry grants `suppliers.view/manage` and `sellers.view/manage` only to Admin; Moderator and Rider navigation and direct routes are denied by the shell, while API and RLS remain independent boundaries. Seller records never create login access or grant any business permission.

## Audit and archive behavior

Creation writes an audit event. Updates and archive/reactivation operations retain the record and actor fields; the existing audit infrastructure remains the source for state-change history. No supplier, seller, product, or sale is hard-deleted by this module.

## Testing and staging

Automated tests verify the Admin-only permission matrix. Test Admin/Moderator/Rider/anonymous REST and RPC access, organization isolation, archived supplier assignment rejection, linked product counts, seller sale aggregation, and preservation of historical references in an isolated Supabase staging project.
