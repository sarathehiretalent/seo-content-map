'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createBrand } from '@/lib/actions/brands'

export function CreateBrandForm() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const formData = new FormData(e.currentTarget)
    const result = await createBrand(formData)

    if (result.error) {
      setError(result.error)
      setLoading(false)
    } else if (result.id) {
      router.push(`/brands/${result.id}`)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-foreground">
          Brand Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          placeholder="My Brand"
          className="mt-1 w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </div>

      <div>
        <label htmlFor="domain" className="block text-sm font-medium text-foreground">
          Domain
        </label>
        <input
          id="domain"
          name="domain"
          type="text"
          required
          placeholder="example.com"
          className="mt-1 w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </div>

      <div>
        <label htmlFor="vertical" className="block text-sm font-medium text-foreground">
          Vertical / Industry
        </label>
        <input
          id="vertical"
          name="vertical"
          type="text"
          placeholder="e.g. SaaS, E-commerce, Health"
          className="mt-1 w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium text-foreground">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          placeholder="Brief description of the brand for AI context..."
          className="mt-1 w-full rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </div>

      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-brand/90 disabled:opacity-50"
      >
        {loading ? 'Creating...' : 'Create Brand'}
      </button>
    </form>
  )
}
