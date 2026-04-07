'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Lock, Mail, User } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [isSetup, setIsSetup] = useState(false)
  const [checking, setChecking] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')

  useEffect(() => {
    // Check if any users exist
    fetch('/api/auth').then(r => r.json()).then(data => {
      if (data.user) { router.push('/dashboard'); return }
      // Check if setup needed
      fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'setup', email: '', password: '', name: '' }),
      }).then(r => r.json()).then(d => {
        if (d.error === 'Setup already completed') setIsSetup(false)
        else setIsSetup(true)
        setChecking(false)
      })
    })
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')

    const action = isSetup ? 'setup' : 'login'
    const body = isSetup ? { action, email, password, name } : { action, email, password }

    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()

    if (data.error) { setError(data.error); setLoading(false); return }
    router.push('/dashboard')
  }

  if (checking) return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-brand" />
    </div>
  )

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand/10">
            <Lock className="h-6 w-6 text-brand" />
          </div>
          <h1 className="text-xl font-bold">SEO Content Map</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isSetup ? 'Create your admin account' : 'Sign in to continue'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {isSetup && (
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Name</label>
              <div className="relative">
                <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} required
                  placeholder="Your name"
                  className="w-full rounded-lg border border-border bg-input pl-9 pr-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand" />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                placeholder="you@company.com"
                className="w-full rounded-lg border border-border bg-input pl-9 pr-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
                placeholder={isSetup ? 'Choose a password' : 'Your password'} minLength={6}
                className="w-full rounded-lg border border-border bg-input pl-9 pr-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand" />
            </div>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button type="submit" disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-brand/90 disabled:opacity-50">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isSetup ? 'Create Admin Account' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
