import { Plus } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageContainer, PageHeader } from '../../components/layout/PageContainer';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/States';
import { Button } from '../../components/ui/button';
import { apiFetch } from '../../lib/api/client';
import { useAuth } from '../auth/use-auth';
import { permissions } from '../../lib/permissions/permission-registry';
import { hasPermission } from '../../lib/permissions/permission-utils';
import type { Category } from './product-types';

export function CategoryPage(): ReactElement {
  const auth = useAuth();
  const canManage = hasPermission(auth.session?.role, permissions.categoriesManage);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const query = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiFetch<{ data: Category[]; requestId: string }>('/api/categories'),
  });
  async function create(): Promise<void> {
    setError('');
    const response = await fetch('/api/categories', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': auth.csrfToken },
      body: JSON.stringify({ name, description }),
    });
    if (!response.ok) {
      const body = (await response.json()) as { error?: { message?: string } };
      setError(body.error?.message || 'Category could not be created.');
      return;
    }
    setName('');
    setDescription('');
    await query.refetch();
  }
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Inventory setup"
        title="Categories"
        description="Organize products with organization-scoped categories."
        actions={
          canManage ? (
            <Button
              onClick={() => void create()}
              disabled={!name.trim()}
              className="bg-blue-600 text-white"
            >
              <Plus size={16} className="mr-2" /> Add category
            </Button>
          ) : undefined
        }
      />
      {canManage && (
        <div className="mb-6 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[1fr_1.5fr_auto]">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Category name"
            className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
          />
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Description (optional)"
            className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
          />
          <Button
            onClick={() => void create()}
            disabled={!name.trim()}
            className="bg-blue-600 text-white"
          >
            Create
          </Button>
          {error && <p className="text-sm text-rose-700 sm:col-span-3">{error}</p>}
        </div>
      )}
      {query.isPending ? (
        <LoadingState label="Loading categories" />
      ) : query.isError ? (
        <ErrorState onRetry={() => void query.refetch()} />
      ) : query.data?.data.data.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {query.data.data.data.map((category) => (
            <div
              key={category.id}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <h2 className="font-semibold text-slate-900">{category.name}</h2>
              <p className="mt-2 text-sm text-slate-500">
                {category.description || 'No description.'}
              </p>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {category.is_active ? 'Active' : 'Inactive'}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No categories yet"
          description="Create categories to keep the catalog organized."
        />
      )}
    </PageContainer>
  );
}
