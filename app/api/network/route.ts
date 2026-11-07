import os from 'node:os'
import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth-guard'

/**
 * Admin-only: the server's local-network addresses, so table QR codes can
 * point phones at this computer while testing (instead of "localhost").
 * Once the app is deployed, QR codes simply use the site's own address.
 */
export async function GET(req: Request) {
  const guard = await requireRole('admin')
  if (guard) return guard

  const host = req.headers.get('host') ?? ''
  const port = host.includes(':') ? host.split(':').pop() : ''
  const rank = (ip: string) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : 3)

  const addresses = Object.values(os.networkInterfaces())
    .flat()
    .filter((a): a is os.NetworkInterfaceInfo => !!a && a.family === 'IPv4' && !a.internal)
    .map(a => a.address)
    .sort((a, b) => rank(a) - rank(b))
    .map(ip => `http://${ip}${port ? `:${port}` : ''}`)

  return NextResponse.json({ addresses })
}
