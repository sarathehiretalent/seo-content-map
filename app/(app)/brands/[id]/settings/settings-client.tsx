'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ExternalLink, Trash2, Loader2, Brain, Save } from 'lucide-react'
import { updateBrand, deleteBrand } from '@/lib/actions/brands'

interface Brand {
  id: string
  name: string
  domain: string
  gscProperty: string | null
  vertical: string | null
  description: string | null
  coreProducts: string | null
  notBrand: string | null
  targetAudience: string | null
  competitors: string | null
  brandIntelligence: string | null
}

export function SettingsClient({ brand, hasGoogleToken }: { brand: Brand; hasGoogleToken: boolean }) {
  const router = useRouter()
  const [gscProperties, setGscProperties] = useState<string[]>([])
  const [loadingProperties, setLoadingProperties] = useState(false)
  const [selectedProperty, setSelectedProperty] = useState(brand.gscProperty ?? '')
  const [saving, setSaving] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [name, setName] = useState(brand.name)
  const [domain, setDomain] = useState(brand.domain)
  const [coreProducts, setCoreProducts] = useState(brand.coreProducts ?? '')
  const [notBrand, setNotBrand] = useState(brand.notBrand ?? '')
  const [targetAudience, setTargetAudience] = useState(brand.targetAudience ?? '')
  const [competitors, setCompetitors] = useState(brand.competitors ?? '')
  const [brandIntelligence, setBrandIntelligence] = useState(brand.brandIntelligence ?? '')

  const hasIntelligence = !!(brand.coreProducts && brand.notBrand)

  useEffect(() => { if (hasGoogleToken) loadProperties() }, [hasGoogleToken])

  async function loadProperties() {
    setLoadingProperties(true)
    try {
      const res = await fetch('/api/gsc/properties')
      const data = await res.json()
      if (data.properties) {
        setGscProperties(data.properties)
        if (!brand.gscProperty) {
          const match = data.properties.find((p: string) => p.includes(brand.domain))
          if (match) setSelectedProperty(match)
        }
      }
    } catch { /* ignore */ }
    setLoadingProperties(false)
  }

  async function handleAnalyze() {
    setAnalyzing(true)
    try {
      // No timeout — deep research can take 2-10 minutes
      const controller = new AbortController()
      const res = await fetch('/api/brand/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId: brand.id }),
        signal: controller.signal,
      })
      const data = await res.json()
      if (data.error) {
        alert(`Analysis failed: ${data.error}`)
      } else {
        if (data.coreProducts) setCoreProducts(data.coreProducts)
        if (data.notBrand) setNotBrand(data.notBrand)
        if (data.targetAudience) setTargetAudience(data.targetAudience)
        if (data.competitors) setCompetitors(data.competitors)
        if (data.brandIntelligence) setBrandIntelligence(data.brandIntelligence)
        router.refresh()
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        alert('Analysis failed. Check terminal for details.')
      }
    }
    setAnalyzing(false)
  }

  async function handleSave() {
    setSaving(true)
    const formData = new FormData()
    formData.set('name', name)
    formData.set('domain', domain)
    formData.set('coreProducts', coreProducts)
    formData.set('notBrand', notBrand)
    formData.set('targetAudience', targetAudience)
    formData.set('competitors', competitors)
    formData.set('brandIntelligence', brandIntelligence)
    formData.set('gscProperty', selectedProperty)
    await updateBrand(brand.id, formData)
    setSaving(false)
    router.refresh()
  }

  async function handleDelete() {
    if (!confirm(`Delete "${brand.name}"? All data will be removed.`)) return
    setDeleting(true)
    await deleteBrand(brand.id)
    router.push('/dashboard')
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">Brand Settings</h2>
        <div className="flex gap-2">
          <button onClick={handleAnalyze} disabled={analyzing}
            className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-brand/90 disabled:opacity-50">
            {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
            {analyzing ? 'Researching (2-8 min)...' : 'Run Brand Analysis'}
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-2 disabled:opacity-50">
            <Save className="h-4 w-4" />{saving ? 'Saving...' : 'Save All'}
          </button>
        </div>
      </div>

      {!hasIntelligence && (
        <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <h3 className="text-sm font-medium text-amber-400 mb-1">Brand Analysis Required</h3>
          <p className="text-xs text-muted-foreground">
            Click &quot;Run Brand Analysis&quot; to scrape your website and research competitors.
            The system will search the web for direct competitors and build a complete brand profile.
          </p>
        </div>
      )}

      <div className="max-w-2xl space-y-6">
        {/* Brand name + domain (minimal) */}
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Brand Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Domain</label>
              <input value={domain} onChange={(e) => setDomain(e.target.value)}
                className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand" />
            </div>
          </div>
        </div>

        {/* Brand Intelligence — all editable */}
        <div className="rounded-lg border border-brand/30 bg-brand/5 p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-brand" />
            <h3 className="font-medium">Brand Intelligence</h3>
            <span className="text-[10px] text-muted-foreground">AI-generated from deep research — fully editable</span>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Core Products & Services
            </label>
            <textarea value={coreProducts} onChange={(e) => setCoreProducts(e.target.value)} rows={3}
              placeholder="What the brand actually sells..."
              className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand" />
          </div>

          <div>
            <label className="block text-xs font-medium text-red-400 mb-1">
              What This Brand is NOT
            </label>
            <textarea value={notBrand} onChange={(e) => setNotBrand(e.target.value)} rows={3}
              placeholder="Similar company names, unrelated industries, topics they blog about but don't sell..."
              className="w-full rounded-lg border border-red-500/30 bg-input px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500" />
            <p className="mt-1 text-[10px] text-muted-foreground">Prevents the AI from confusing your brand with similar companies or unrelated topics.</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Target Audience</label>
            <textarea value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)} rows={2}
              className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand" />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Direct Competitors
              <span className="ml-1 text-[10px] opacity-60">Researched via web search — edit to correct</span>
            </label>
            <textarea value={competitors} onChange={(e) => setCompetitors(e.target.value)} rows={4}
              placeholder="https://competitor.com — Description of why they compete..."
              className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand" />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Full Brand Intelligence
            </label>
            <textarea value={brandIntelligence} onChange={(e) => setBrandIntelligence(e.target.value)} rows={8}
              className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand" />
          </div>
        </div>

        {/* Google Search Console */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="font-medium mb-3">Google Search Console</h3>
          {!hasGoogleToken ? (
            <div>
              <p className="text-sm text-muted-foreground mb-3">Connect Google for real clicks, impressions, CTR.</p>
              <a href="/api/auth/google" className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-brand/90">
                <ExternalLink className="h-4 w-4" />Connect Google
              </a>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="h-2 w-2 rounded-full bg-green-400" /><span className="text-sm text-green-400">Connected</span>
              </div>
              {brand.gscProperty && (
                <div className="flex items-center gap-2 mb-3 rounded-lg bg-surface-2 px-3 py-2">
                  <Check className="h-4 w-4 text-green-400" /><span className="text-sm">{brand.gscProperty}</span>
                </div>
              )}
              {loadingProperties ? <p className="text-sm text-muted-foreground">Loading...</p> : (
                <select value={selectedProperty} onChange={(e) => setSelectedProperty(e.target.value)}
                  className="w-full rounded-lg border border-border bg-input px-3 py-2 text-sm">
                  <option value="">Select property...</option>
                  {gscProperties.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              )}
            </div>
          )}
        </div>

        {/* Delete */}
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-4">
          <button onClick={handleDelete} disabled={deleting}
            className="flex items-center gap-2 rounded-lg border border-red-500/50 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/10 disabled:opacity-50">
            <Trash2 className="h-4 w-4" />{deleting ? 'Deleting...' : 'Delete Brand'}
          </button>
        </div>
      </div>
    </div>
  )
}
