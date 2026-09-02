import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'Nyeta - AI Visual Assistant',
        short_name: 'Nyeta',
        description: 'AI visual assistant for blind users',
        id: '/',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#F4F8FF',
        theme_color: '#F4F8FF',
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
