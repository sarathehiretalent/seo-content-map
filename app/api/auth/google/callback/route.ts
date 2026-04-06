import { NextRequest, NextResponse } from 'next/server'
import { exchangeCode } from '@/lib/google-auth'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(new URL('/dashboard?error=no_code', request.url))
  }

  try {
    await exchangeCode(code)
    return NextResponse.redirect(new URL('/dashboard?gsc=connected', request.url))
  } catch (error) {
    console.error('Google OAuth error:', error)
    return NextResponse.redirect(new URL('/dashboard?error=auth_failed', request.url))
  }
}
