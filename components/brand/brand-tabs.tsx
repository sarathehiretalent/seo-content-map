'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

interface BrandTabsProps {
  brandId: string
}

export function BrandTabs({ brandId }: BrandTabsProps) {
  const pathname = usePathname()
  const base = `/brands/${brandId}`

  const tabs = [
    { href: base, label: 'Overview', exact: true },
    { href: `${base}/diagnostic`, label: 'Diagnostic' },
    { href: `${base}/optimize`, label: 'Optimize' },
    { href: `${base}/content-map`, label: 'Content Map' },
    { href: `${base}/aoe`, label: 'AEO' },
    { href: `${base}/performance`, label: 'Performance' },
    { href: `${base}/settings`, label: 'Settings' },
  ]

  return (
    <div className="flex gap-1 overflow-x-auto">
      {tabs.map((tab) => {
        const isActive = tab.exact
          ? pathname === tab.href
          : pathname.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'whitespace-nowrap rounded-t-lg px-4 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-background text-brand'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </div>
  )
}
