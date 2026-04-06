'use client'

import { useState } from 'react'
import { Download, FileSpreadsheet, ExternalLink } from 'lucide-react'

interface Props {
  brandId: string
  brandName: string
  contentMap: {
    id: string
    name: string
    _count: { contentPieces: number; pageOptimizations: number }
  } | null
  diagnostic: { id: string; name: string } | null
}

export function ExportClient({ brandId, brandName, contentMap, diagnostic }: Props) {
  const [exportingDiag, setExportingDiag] = useState(false)
  const [exportingMap, setExportingMap] = useState(false)
  const [diagUrl, setDiagUrl] = useState<string | null>(null)
  const [mapUrl, setMapUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function exportDiagnostic() {
    if (!diagnostic) return
    setExportingDiag(true)
    setError(null)
    try {
      const res = await fetch('/api/export/diagnostic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, diagnosticId: diagnostic.id }),
      })
      const data = await res.json()
      if (data.url) setDiagUrl(data.url)
      else setError(data.error ?? 'Export failed')
    } catch {
      setError('Export failed. Make sure Google is connected.')
    }
    setExportingDiag(false)
  }

  async function exportContentMap() {
    if (!contentMap) return
    setExportingMap(true)
    setError(null)
    try {
      const res = await fetch('/api/export/content-map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId, contentMapId: contentMap.id }),
      })
      const data = await res.json()
      if (data.url) setMapUrl(data.url)
      else setError(data.error ?? 'Export failed')
    } catch {
      setError('Export failed. Make sure Google is connected.')
    }
    setExportingMap(false)
  }

  return (
    <div className="p-6">
      <h2 className="mb-1 text-lg font-semibold">Export to Google Sheets</h2>
      <p className="mb-6 text-sm text-muted-foreground">
        Export diagnostic and content map data to Google Sheets for sharing and collaboration
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {/* Diagnostic Export */}
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center gap-3 mb-3">
            <FileSpreadsheet className="h-5 w-5 text-brand" />
            <h3 className="font-medium">Diagnostic Export</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            3 sheets: Rankings, SERP Analysis, Current Structure
          </p>
          {diagnostic ? (
            <>
              <button
                onClick={exportDiagnostic}
                disabled={exportingDiag}
                className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-brand/90 disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                {exportingDiag ? 'Exporting...' : 'Export Diagnostic'}
              </button>
              {diagUrl && (
                <a
                  href={diagUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 flex items-center gap-2 text-sm text-brand hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open in Google Sheets
                </a>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No completed diagnostic to export</p>
          )}
        </div>

        {/* Content Map Export */}
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center gap-3 mb-3">
            <FileSpreadsheet className="h-5 w-5 text-brand" />
            <h3 className="font-medium">Content Map Export</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            4 sheets: Content Map, Page Optimizations, AOE Strategy, SERP Opportunities
          </p>
          {contentMap ? (
            <>
              <p className="text-xs text-muted-foreground mb-2">
                {contentMap._count.contentPieces} content pieces,{' '}
                {contentMap._count.pageOptimizations} page optimizations
              </p>
              <button
                onClick={exportContentMap}
                disabled={exportingMap}
                className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-brand/90 disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                {exportingMap ? 'Exporting...' : 'Export Content Map'}
              </button>
              {mapUrl && (
                <a
                  href={mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 flex items-center gap-2 text-sm text-brand hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open in Google Sheets
                </a>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No completed content map to export</p>
          )}
        </div>
      </div>
    </div>
  )
}
