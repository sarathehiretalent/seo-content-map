'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  Globe,
  Plus,
  Search,
  Map,
  Zap,
  Bot,
  Settings,
  Stethoscope,
  BarChart3,
  Gauge,
  Shield,
  LogOut,
  User,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Brand {
  id: string
  name: string
  domain: string
}

interface SidebarProps {
  brands: Brand[]
}

const mainNav = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/brands', label: 'Brands', icon: Globe },
]

export function Sidebar({ brands }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<{ name: string; email: string; role: string } | null>(null)

  useEffect(() => {
    fetch('/api/auth').then((r) => r.json()).then((d) => setCurrentUser(d.user)).catch(() => {})
  }, [])

  async function handleLogout() {
    await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) })
    router.push('/login')
  }

  return (
    <aside className="flex h-full w-64 flex-col border-r border-border bg-surface">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <Search className="h-5 w-5 text-brand" />
        <span className="text-lg font-semibold text-foreground">SEO Content Map</span>
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        <div className="space-y-1">
          {mainNav.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-brand/12 text-brand'
                    : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground'
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}
        </div>

        {brands.length > 0 && (
          <div className="mt-6">
            <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Brands
            </h3>
            <div className="space-y-1">
              {brands.map((brand) => {
                const brandPath = `/brands/${brand.id}`
                const isActive = pathname.startsWith(brandPath)
                return (
                  <div key={brand.id}>
                    <Link
                      href={brandPath}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-brand/12 text-brand'
                          : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground'
                      )}
                    >
                      <Globe className="h-4 w-4" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{brand.name}</div>
                        <div className="truncate text-xs opacity-60">{brand.domain}</div>
                      </div>
                    </Link>
                    {isActive && (
                      <div className="ml-4 mt-1 space-y-0.5 border-l border-border pl-3">
                        {[
                          { href: `${brandPath}/diagnostic`, label: 'Diagnostic', icon: Stethoscope },
                          { href: `${brandPath}/optimize`, label: 'Optimize', icon: Zap },
                          { href: `${brandPath}/content-map`, label: 'Content Map', icon: Map },
                          { href: `${brandPath}/aoe`, label: 'AEO', icon: Bot },
                          { href: `${brandPath}/speed`, label: 'Speed', icon: Gauge },
                          { href: `${brandPath}/performance`, label: 'Performance', icon: BarChart3 },
                          { href: `${brandPath}/settings`, label: 'Settings', icon: Settings },
                        ].map((sub) => (
                          <Link
                            key={sub.href}
                            href={sub.href}
                            className={cn(
                              'flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                              pathname.startsWith(sub.href)
                                ? 'text-brand'
                                : 'text-muted-foreground hover:text-foreground'
                            )}
                          >
                            <sub.icon className="h-3.5 w-3.5" />
                            {sub.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </nav>

      <div className="border-t border-border p-3 space-y-2">
        {currentUser?.role === 'admin' && (
          <>
            <Link href="/admin"
              className={cn('flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                pathname === '/admin' ? 'text-brand bg-brand/10' : 'text-muted-foreground hover:text-foreground')}>
              <Shield className="h-3.5 w-3.5" />Admin Panel
            </Link>
            <Link href="/brands/new"
              className="flex items-center justify-center gap-2 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-brand/90">
              <Plus className="h-4 w-4" />New Brand
            </Link>
          </>
        )}
        {currentUser && (
          <div className="flex items-center justify-between rounded-md px-2 py-1.5">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand/10 text-[10px] font-bold text-brand">
                {currentUser.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="text-[11px] font-medium leading-tight">{currentUser.name}</div>
                <div className="text-[9px] text-muted-foreground">{currentUser.role}</div>
              </div>
            </div>
            <button onClick={handleLogout} className="text-muted-foreground hover:text-foreground" title="Logout">
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
