import './globals.css'
import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'RechnungenApp',
  description: 'Arbeitszeiten erfassen und Rechnungen verwalten',
  applicationName: 'RechnungenApp',
  appleWebApp: {
    capable: true,
    title: 'RechnungenApp',
    statusBarStyle: 'default',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#f4f6fb',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  )
}