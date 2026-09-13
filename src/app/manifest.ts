import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Nyeta',
    short_name: 'Nyeta',
    description: 'Visual assistance for blind users',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#090909',
    theme_color: '#090909',
    icons: [
      {
        src: '/icons/nyeta-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icons/nyeta-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/icons/nyeta-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
