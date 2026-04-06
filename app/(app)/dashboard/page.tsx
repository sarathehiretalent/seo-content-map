import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { Header } from '@/components/layout/header'
import { Globe, ArrowRight, Plus, Stethoscope, Map } from 'lucide-react'

export default async function DashboardPage() {
  const brands = await prisma.brand.findMany({
    include: {
      _count: { select: { keywords: true, contentMaps: true, diagnostics: true } },
      diagnostics: { orderBy: { createdAt: 'desc' }, take: 1 },
      contentMaps: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div>
      <Header
        title="Dashboard"
        description="Overview of all your brands and their SEO status"
        actions={
          <Link
            href="/brands/new"
            className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-brand/90"
          >
            <Plus className="h-4 w-4" />
            New Brand
          </Link>
        }
      />

      <div className="p-6">
        {brands.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface p-12 text-center">
            <Globe className="mb-4 h-12 w-12 text-muted-foreground" />
            <h2 className="text-lg font-semibold">No brands yet</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Add your first brand to start analyzing SEO performance
            </p>
            <Link
              href="/brands/new"
              className="mt-4 flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-brand/90"
            >
              <Plus className="h-4 w-4" />
              Add Brand
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {brands.map((brand) => {
              const lastDiag = brand.diagnostics[0]
              const lastMap = brand.contentMaps[0]
              const diagStatus = lastDiag?.status ?? 'none'
              const mapStatus = lastMap?.status ?? 'none'

              return (
                <Link
                  key={brand.id}
                  href={`/brands/${brand.id}`}
                  className="group rounded-xl border border-border bg-card p-5 transition-colors hover:border-brand/30"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-card-foreground">
                        {brand.name}
                      </h3>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {brand.domain}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-brand" />
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <div className="rounded-lg bg-surface-2 px-3 py-2 text-center">
                      <div className="text-lg font-semibold text-foreground">
                        {brand._count.keywords}
                      </div>
                      <div className="text-xs text-muted-foreground">Keywords</div>
                    </div>
                    <div className="rounded-lg bg-surface-2 px-3 py-2 text-center">
                      <div className="text-lg font-semibold text-foreground">
                        {brand._count.diagnostics}
                      </div>
                      <div className="text-xs text-muted-foreground">Diagnostics</div>
                    </div>
                    <div className="rounded-lg bg-surface-2 px-3 py-2 text-center">
                      <div className="text-lg font-semibold text-foreground">
                        {brand._count.contentMaps}
                      </div>
                      <div className="text-xs text-muted-foreground">Maps</div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-3 text-xs">
                    <div className="flex items-center gap-1">
                      <Stethoscope className="h-3 w-3" />
                      <span
                        className={
                          diagStatus === 'completed'
                            ? 'text-green-400'
                            : diagStatus === 'none'
                              ? 'text-muted-foreground'
                              : 'text-amber-400'
                        }
                      >
                        {diagStatus === 'none' ? 'No diagnostic' : `Diag: ${diagStatus}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Map className="h-3 w-3" />
                      <span
                        className={
                          mapStatus === 'completed'
                            ? 'text-green-400'
                            : mapStatus === 'none'
                              ? 'text-muted-foreground'
                              : 'text-amber-400'
                        }
                      >
                        {mapStatus === 'none' ? 'No content map' : `Map: ${mapStatus}`}
                      </span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
