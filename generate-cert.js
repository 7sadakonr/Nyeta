const selfsigned = require('selfsigned');
const fs = require('fs');
const ip = require('ip');
const path = require('path');

const attrs = [
    { name: 'commonName', value: 'localhost' },
    { name: 'commonName', value: ip.address() }
];

// Wrap in async function
(async () => {
    try {
        console.log('Generating keys (Async)...');
        // v5 might be async
        const pems = await selfsigned.generate(attrs, { days: 365, keySize: 2048 });

        console.log('Keys generated.');

        fs.writeFileSync(path.join(__dirname, 'cert.pem'), pems.cert);
        fs.writeFileSync(path.join(__dirname, 'key.pem'), pems.private);

        console.log('SSL Certificates generated successfully.');
        console.log('Local IP:', ip.address());
        console.log('Files created: cert.pem, key.pem');
    } catch (err) {
        console.error('Failed to generate certificates:', err);
    }
})();
