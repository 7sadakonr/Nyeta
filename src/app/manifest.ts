import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'Nyeta - AI Visual Assistant',
        short_name: 'Nyeta',
        description: 'AI visual assistant for blind users',
        start_url: '/',
        display: 'standalone',
        background_color: '#08111F',
        theme_color: '#08111F',
        icons: [
            {
                src: '/favicon.ico',
                sizes: 'any',
                type: 'image/x-icon',
            },
        ],
    };
}
