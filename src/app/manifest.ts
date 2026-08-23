import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'Nyeta - AI Visual Assistant',
        short_name: 'Nyeta',
        description: 'AI visual assistant for blind users',
        start_url: '/',
        display: 'standalone',
        background_color: '#F4F8FF',
        theme_color: '#F4F8FF',
        icons: [
            {
                src: '/favicon.ico',
                sizes: 'any',
                type: 'image/x-icon',
            },
        ],
    };
}
