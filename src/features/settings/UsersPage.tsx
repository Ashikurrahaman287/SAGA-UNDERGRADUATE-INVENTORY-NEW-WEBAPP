import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus, X } from 'lucide-react';
import { apiFetch } from '../../lib/api/client';
import { useAuth } from '../auth/use-auth';
import { Button } from '../../components/ui/button';
import { Card } from '../../components/ui/card';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/States';
import { PageContainer, PageHeader } from '../../components/layout/PageContainer';

type Member = {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  phone: string;
  role: 'admin' | 'moderator' | 'rider';
  isActive: boolean;
  riderEligible: boolean;
  createdAt: string;
};
type MembersResponse = {
  data: Member[];
  pagination: { page: number; pageSize: number; total: number };
  requestId: string;
};

const roleLabel = (role: Member['role']) => role[0].toUpperCase() + role.slice(1);

export function UsersPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [roleFilter, setRoleFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [invite, setInvite] = useState({
    fullName: '',
    email: '',
    role: 'moderator' as Member['role'],
  });
  const [notice, setNotice] = useState('');
  const params = new URLSearchParams({ page: String(page), pageSize: '50' });
  if (roleFilter) params.set('role', roleFilter);
  if (activeFilter) params.set('active', activeFilter);
  const query = useQuery({
    queryKey: ['admin-users', page, roleFilter, activeFilter],
    queryFn: () => apiFetch<MembersResponse>(`/api/admin/users?${params}`),
  });
  const refresh = async () => queryClient.invalidateQueries({ queryKey: ['admin-users'] });
  const createMember = useMutation({
    mutationFn: () =>
      apiFetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': auth.csrfToken },
        body: JSON.stringify(invite),
      }),
    onSuccess: async () => {
      setShowInvite(false);
      setInvite({ fullName: '', email: '', role: 'moderator' });
      setNotice('Invitation sent.');
      await refresh();
    },
    onError: (error) => setNotice(error.message),
  });
  const updateMember = useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: Record<string, unknown> }) =>
      apiFetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': auth.csrfToken },
        body: JSON.stringify(changes),
      }),
    onSuccess: async () => {
      setNotice('User access updated.');
      await refresh();
    },
    onError: (error) => setNotice(error.message),
  });

  if (query.isLoading) return <LoadingState label="Loading organization members" />;
  if (query.isError) return <ErrorState onRetry={() => void query.refetch()} />;
  const members = query.data?.data.data || [];
  const pagination = query.data?.data.pagination;

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Administration"
        title="Users and roles"
        description="Manage organization memberships, account status, and Rider delivery eligibility."
        actions={
          <Button
            onClick={() => setShowInvite(true)}
            className="gap-2 bg-teal-800 text-white hover:bg-teal-900"
          >
            <UserPlus size={16} /> Invite user
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Role
          <select
            value={roleFilter}
            onChange={(event) => {
              setRoleFilter(event.target.value);
              setPage(1);
            }}
            className="mt-1 block min-w-36 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-800"
          >
            <option value="">All roles</option>
            <option value="admin">Admin</option>
            <option value="moderator">Moderator</option>
            <option value="rider">Rider</option>
          </select>
        </label>
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Account
          <select
            value={activeFilter}
            onChange={(event) => {
              setActiveFilter(event.target.value);
              setPage(1);
            }}
            className="mt-1 block min-w-36 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-800"
          >
            <option value="">All states</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </label>
        <p aria-live="polite" role="status" className="ml-auto pb-2 text-sm text-slate-600">
          {notice}
        </p>
      </div>
      {members.length === 0 ? (
        <EmptyState
          title="No members found"
          description="Try another filter or invite a user to this organization."
        />
      ) : (
        <Card className="overflow-hidden rounded-lg border-slate-200 shadow-none">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Member</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Account</th>
                  <th className="px-4 py-3 font-semibold">Delivery eligibility</th>
                  <th className="px-4 py-3 font-semibold">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {members.map((member) => {
                  const isSelf = member.userId === auth.session?.user.id;
                  return (
                    <tr key={member.id} className="align-middle">
                      <td className="px-5 py-4">
                        <div className="font-medium text-slate-900">{member.fullName}</div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          {member.email || member.phone || 'No contact details'}
                        </div>
                        {isSelf && (
                          <span className="mt-1 inline-block text-[11px] font-semibold text-teal-800">
                            You
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <select
                          aria-label={`Role for ${member.fullName}`}
                          value={member.role}
                          disabled={isSelf || updateMember.isPending}
                          onChange={(event) =>
                            updateMember.mutate({
                              id: member.id,
                              changes: { role: event.target.value },
                            })
                          }
                          className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm disabled:bg-slate-100"
                        >
                          {(['admin', 'moderator', 'rider'] as const).map((role) => (
                            <option key={role} value={role}>
                              {roleLabel(role)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-4">
                        <label className="flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={member.isActive}
                            disabled={isSelf || updateMember.isPending}
                            onChange={(event) =>
                              updateMember.mutate({
                                id: member.id,
                                changes: { isActive: event.target.checked },
                              })
                            }
                            className="size-4 accent-teal-800"
                          />
                          {member.isActive ? 'Active' : 'Inactive'}
                        </label>
                      </td>
                      <td className="px-4 py-4">
                        {member.role === 'rider' ? (
                          <label className="flex items-center gap-2 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              checked={member.riderEligible}
                              disabled={!member.isActive || updateMember.isPending}
                              onChange={(event) =>
                                updateMember.mutate({
                                  id: member.id,
                                  changes: { riderEligible: event.target.checked },
                                })
                              }
                              className="size-4 accent-teal-800"
                            />
                            {member.riderEligible && member.isActive ? 'Eligible' : 'Not eligible'}
                          </label>
                        ) : (
                          <span className="text-slate-400">Not applicable</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-slate-500">
                        {new Date(member.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <footer className="flex items-center justify-between border-t border-slate-200 px-5 py-3 text-sm text-slate-500">
            <span>{pagination?.total || 0} members</span>
            <div className="flex items-center gap-2">
              <Button
                className="border border-slate-300 bg-white px-3 py-1.5"
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
              >
                Previous
              </Button>
              <span>Page {page}</span>
              <Button
                className="border border-slate-300 bg-white px-3 py-1.5"
                disabled={!pagination || page * pagination.pageSize >= pagination.total}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </Button>
            </div>
          </footer>
        </Card>
      )}

      {showInvite && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowInvite(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="invite-title"
            className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl"
          >
            <header className="flex items-start justify-between gap-4">
              <div>
                <h2 id="invite-title" className="text-lg font-semibold text-slate-950">
                  Invite organization user
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  An invitation email will be sent through Supabase Auth.
                </p>
              </div>
              <Button
                aria-label="Close"
                onClick={() => setShowInvite(false)}
                className="p-2 text-slate-500 hover:bg-slate-100"
              >
                <X size={18} />
              </Button>
            </header>
            <form
              className="mt-5 space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                createMember.mutate();
              }}
            >
              <label className="block text-sm font-medium text-slate-700">
                Full name
                <input
                  required
                  maxLength={200}
                  value={invite.fullName}
                  onChange={(event) => setInvite({ ...invite, fullName: event.target.value })}
                  className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Email
                <input
                  required
                  type="email"
                  maxLength={254}
                  value={invite.email}
                  onChange={(event) => setInvite({ ...invite, email: event.target.value })}
                  className="mt-1.5 w-full rounded-md border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Role
                <select
                  value={invite.role}
                  onChange={(event) =>
                    setInvite({ ...invite, role: event.target.value as Member['role'] })
                  }
                  className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2"
                >
                  <option value="admin">Admin</option>
                  <option value="moderator">Moderator</option>
                  <option value="rider">Rider</option>
                </select>
              </label>
              {createMember.isError && (
                <p role="alert" className="text-sm text-rose-700">
                  {createMember.error.message}
                </p>
              )}
              <footer className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  onClick={() => setShowInvite(false)}
                  className="border border-slate-300 bg-white"
                >
                  Cancel
                </Button>
                <Button
                  disabled={createMember.isPending || !auth.csrfToken}
                  className="bg-teal-800 text-white hover:bg-teal-900"
                >
                  {createMember.isPending ? 'Sending...' : 'Send invitation'}
                </Button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </PageContainer>
  );
}
