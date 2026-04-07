'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Shield, Users, Building2, Activity, Plus, Trash2, Loader2, ChevronDown, ChevronRight, Eye, Edit3, BarChart3 } from 'lucide-react'

interface User { id: string; email: string; name: string; role: string; isActive: boolean; createdAt: string }
interface Brand { id: string; name: string; domain: string; createdBy: string | null }
interface BrandMember { id: string; user: { id: string; name: string; email: string }; brand: { id: string; name: string }; role: string }
interface ActivityEntry { id: string; userId: string; brandId: string | null; action: string; details: string | null; createdAt: string; user: { name: string; email: string } }

type Tab = 'users' | 'permissions' | 'activity'

const ROLE_ICONS: Record<string, typeof Eye> = { viewer: Eye, editor: Edit3, analyst: BarChart3 }
const ROLE_COLORS: Record<string, string> = { viewer: 'text-blue-400 bg-blue-500/10', editor: 'text-amber-400 bg-amber-500/10', analyst: 'text-green-400 bg-green-500/10', admin: 'text-brand bg-brand/10' }
const ROLE_DESC: Record<string, string> = { viewer: 'Can only view data', editor: 'Can edit, check, update', analyst: 'Can run diagnostics & generate', admin: 'Full access' }

export function AdminClient({ users, brands, brandMembers, recentActivity }: {
  users: User[]; brands: Brand[]; brandMembers: BrandMember[]; recentActivity: ActivityEntry[]
}) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('users')
  const [showAddUser, setShowAddUser] = useState(false)
  const [showAssign, setShowAssign] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // New user form
  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')
  const [newPassword, setNewPassword] = useState('')

  // Assign form
  const [assignUserId, setAssignUserId] = useState('')
  const [assignBrandId, setAssignBrandId] = useState('')
  const [assignRole, setAssignRole] = useState<string>('viewer')

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: newEmail, name: newName, password: newPassword }),
    })
    const data = await res.json()
    if (data.error) { setError(data.error); setLoading(false); return }
    setShowAddUser(false); setNewEmail(''); setNewName(''); setNewPassword('')
    setLoading(false); router.refresh()
  }

  async function handleToggleUser(userId: string, isActive: boolean) {
    await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, isActive: !isActive }),
    })
    router.refresh()
  }

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const res = await fetch('/api/admin/permissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: assignUserId, brandId: assignBrandId, role: assignRole }),
    })
    const data = await res.json()
    if (data.error) { setError(data.error); setLoading(false); return }
    setShowAssign(false); setLoading(false); router.refresh()
  }

  async function handleRemoveAccess(memberId: string) {
    await fetch('/api/admin/permissions', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId }),
    })
    router.refresh()
  }

  async function handleChangeRole(memberId: string, newRole: string) {
    await fetch('/api/admin/permissions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId, role: newRole }),
    })
    router.refresh()
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Shield className="h-6 w-6 text-brand" />
        <h1 className="text-xl font-bold">Admin Panel</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 rounded-lg border border-border bg-surface p-1 w-fit">
        {([
          { key: 'users' as Tab, label: 'Users', icon: Users, count: users.length },
          { key: 'permissions' as Tab, label: 'Brand Access', icon: Building2, count: brandMembers.length },
          { key: 'activity' as Tab, label: 'Activity Log', icon: Activity, count: recentActivity.length },
        ]).map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${tab === t.key ? 'bg-brand text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            <t.icon className="h-3.5 w-3.5" />{t.label} ({t.count})
          </button>
        ))}
      </div>

      {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

      {/* ── Users Tab ── */}
      {tab === 'users' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-muted-foreground">Manage team members. Create accounts and control access.</p>
            <button onClick={() => setShowAddUser(true)}
              className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-brand/90">
              <Plus className="h-3.5 w-3.5" />Add User
            </button>
          </div>

          {showAddUser && (
            <form onSubmit={handleCreateUser} className="rounded-lg border border-brand/30 bg-brand/5 p-4 mb-4 space-y-3">
              <h3 className="text-sm font-medium">New User</h3>
              <div className="grid grid-cols-3 gap-3">
                <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} required placeholder="Name"
                  className="rounded-lg border border-border bg-input px-3 py-2 text-sm" />
                <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required placeholder="Email"
                  className="rounded-lg border border-border bg-input px-3 py-2 text-sm" />
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required placeholder="Password" minLength={6}
                  className="rounded-lg border border-border bg-input px-3 py-2 text-sm" />
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={loading}
                  className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-primary-foreground">
                  {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}Create
                </button>
                <button type="button" onClick={() => setShowAddUser(false)} className="rounded-lg border border-border px-3 py-1.5 text-xs">Cancel</button>
              </div>
            </form>
          )}

          <div className="space-y-2">
            {users.map((u) => (
              <div key={u.id} className={`flex items-center justify-between rounded-lg border p-3 ${u.isActive ? 'border-border' : 'border-red-500/20 opacity-60'}`}>
                <div className="flex items-center gap-3">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${ROLE_COLORS[u.role]}`}>
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="text-sm font-medium">{u.name}</div>
                    <div className="text-[10px] text-muted-foreground">{u.email}</div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${ROLE_COLORS[u.role]}`}>{u.role}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">{brandMembers.filter((m) => m.user.id === u.id).length} brands</span>
                  {u.role !== 'admin' && (
                    <button onClick={() => handleToggleUser(u.id, u.isActive)}
                      className={`rounded px-2 py-1 text-[10px] ${u.isActive ? 'text-red-400 hover:bg-red-500/10' : 'text-green-400 hover:bg-green-500/10'}`}>
                      {u.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Permissions Tab ── */}
      {tab === 'permissions' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-muted-foreground">Control who can access which brands and with what permissions.</p>
            <button onClick={() => setShowAssign(true)}
              className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-brand/90">
              <Plus className="h-3.5 w-3.5" />Assign Access
            </button>
          </div>

          {/* Role legend */}
          <div className="flex gap-4 mb-4 text-[10px] text-muted-foreground">
            {(['viewer', 'editor', 'analyst'] as const).map((r) => (
              <span key={r} className="flex items-center gap-1.5">
                <span className={`rounded-full px-1.5 py-0.5 font-medium ${ROLE_COLORS[r]}`}>{r}</span>
                {ROLE_DESC[r]}
              </span>
            ))}
          </div>

          {showAssign && (
            <form onSubmit={handleAssign} className="rounded-lg border border-brand/30 bg-brand/5 p-4 mb-4 space-y-3">
              <h3 className="text-sm font-medium">Assign Brand Access</h3>
              <div className="grid grid-cols-3 gap-3">
                <select value={assignUserId} onChange={(e) => setAssignUserId(e.target.value)} required
                  className="rounded-lg border border-border bg-input px-3 py-2 text-sm">
                  <option value="">Select user</option>
                  {users.filter((u) => u.role !== 'admin').map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                <select value={assignBrandId} onChange={(e) => setAssignBrandId(e.target.value)} required
                  className="rounded-lg border border-border bg-input px-3 py-2 text-sm">
                  <option value="">Select brand</option>
                  {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <select value={assignRole} onChange={(e) => setAssignRole(e.target.value)}
                  className="rounded-lg border border-border bg-input px-3 py-2 text-sm">
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                  <option value="analyst">Analyst</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={loading}
                  className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-primary-foreground">
                  {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}Assign
                </button>
                <button type="button" onClick={() => setShowAssign(false)} className="rounded-lg border border-border px-3 py-1.5 text-xs">Cancel</button>
              </div>
            </form>
          )}

          {/* Group by brand */}
          {brands.map((brand) => {
            const members = brandMembers.filter((m) => m.brand.id === brand.id)
            return (
              <div key={brand.id} className="mb-4 rounded-lg border border-border p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="h-4 w-4 text-brand" />
                  <span className="text-sm font-medium">{brand.name}</span>
                  <span className="text-[10px] text-muted-foreground">{brand.domain}</span>
                  <span className="text-[10px] text-muted-foreground ml-auto">{members.length} member{members.length !== 1 ? 's' : ''}</span>
                </div>
                {members.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground ml-6">No users assigned. Admin has full access by default.</p>
                ) : (
                  <div className="space-y-1 ml-6">
                    {members.map((m) => (
                      <div key={m.id} className="flex items-center justify-between text-xs">
                        <span>{m.user.name} <span className="text-muted-foreground">({m.user.email})</span></span>
                        <div className="flex items-center gap-2">
                          <select value={m.role} onChange={(e) => handleChangeRole(m.id, e.target.value)}
                            className="rounded border border-border bg-input px-2 py-0.5 text-[10px]">
                            <option value="viewer">viewer</option>
                            <option value="editor">editor</option>
                            <option value="analyst">analyst</option>
                          </select>
                          <button onClick={() => handleRemoveAccess(m.id)} className="text-red-400 hover:text-red-300">
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Activity Tab ── */}
      {tab === 'activity' && (
        <div>
          <p className="text-xs text-muted-foreground mb-4">Recent activity across all users and brands.</p>
          <div className="space-y-1">
            {recentActivity.map((a) => (
              <div key={a.id} className="flex items-center gap-3 rounded-lg border border-border/50 px-3 py-2 text-xs">
                <span className="text-muted-foreground w-32 flex-shrink-0">{new Date(a.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                <span className="font-medium w-28 flex-shrink-0">{a.user.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  a.action === 'login' ? 'bg-blue-500/10 text-blue-400' :
                  a.action.startsWith('run_') ? 'bg-green-500/10 text-green-400' :
                  a.action.startsWith('generate_') ? 'bg-amber-500/10 text-amber-400' :
                  'bg-surface-2 text-muted-foreground'
                }`}>{a.action.replace(/_/g, ' ')}</span>
                {a.details && <span className="text-muted-foreground truncate">{a.details}</span>}
              </div>
            ))}
            {recentActivity.length === 0 && <p className="text-xs text-muted-foreground text-center py-8">No activity yet.</p>}
          </div>
        </div>
      )}
    </div>
  )
}
