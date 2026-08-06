import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'RechnungenApp',
    short_name: 'RechnungenApp',
    description: 'Arbeitszeiten erfassen und Rechnungen verwalten',
    start_url: '/',
    display: 'standalone',
    background_color: '#f4f6fb',
    theme_color: '#2167f3',
    icons: [
      {
        src: '/icon.png',
        sizes: '1024x1024',
        type: 'image/png',
      },
    ],
  }
}