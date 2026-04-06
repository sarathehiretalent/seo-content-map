import { google } from 'googleapis'
import { prisma } from '@/lib/prisma'

const SCOPES = [
  'https://www.googleapis.com/auth/webmasters.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
]

export function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )
}

export function getAuthUrl(): string {
  const client = getOAuth2Client()
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  })
}

export async function exchangeCode(code: string) {
  const client = getOAuth2Client()
  const { tokens } = await client.getToken(code)

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error('Failed to get tokens from Google')
  }

  // Store tokens in DB (upsert — we only keep one set of tokens)
  const existing = await prisma.googleToken.findFirst()
  if (existing) {
    await prisma.googleToken.update({
      where: { id: existing.id },
      data: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(tokens.expiry_date ?? Date.now() + 3600000),
      },
    })
  } else {
    await prisma.googleToken.create({
      data: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token!,
        expiresAt: new Date(tokens.expiry_date ?? Date.now() + 3600000),
      },
    })
  }

  return tokens
}

export async function getAuthenticatedClient() {
  const tokenRecord = await prisma.googleToken.findFirst()
  if (!tokenRecord) {
    throw new Error('No Google tokens found. Please connect Google first.')
  }

  const client = getOAuth2Client()
  client.setCredentials({
    access_token: tokenRecord.accessToken,
    refresh_token: tokenRecord.refreshToken,
    expiry_date: tokenRecord.expiresAt.getTime(),
  })

  // Auto-refresh if expired
  if (tokenRecord.expiresAt < new Date()) {
    const { credentials } = await client.refreshAccessToken()
    await prisma.googleToken.update({
      where: { id: tokenRecord.id },
      data: {
        accessToken: credentials.access_token!,
        expiresAt: new Date(credentials.expiry_date ?? Date.now() + 3600000),
      },
    })
    client.setCredentials(credentials)
  }

  return client
}
