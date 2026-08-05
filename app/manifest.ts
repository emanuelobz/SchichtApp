import type { MetadataRoute } from 'next'
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SchichtApp', short_name: 'SchichtApp', description: 'Arbeitszeiten einfach erfassen',
    start_url: '/', display: 'standalone', background_color: '#f4f6fb', theme_color: '#2167f3',
  }
}
