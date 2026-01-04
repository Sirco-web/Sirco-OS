#!/usr/bin/env node
/**
 * Download a file using Node.js https module
 * Replacement for curl/wget which may not be available in minimal Docker images
 * 
 * Usage: node scripts/download-file.js <url> <output-path>
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const url = process.argv[2];
const outputPath = process.argv[3];

if (!url || !outputPath) {
    console.error('Usage: node download-file.js <url> <output-path>');
    process.exit(1);
}

// Ensure output directory exists
const outputDir = path.dirname(outputPath);
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

function download(downloadUrl, dest, redirectCount = 0) {
    if (redirectCount > 10) {
        console.error('Too many redirects');
        process.exit(1);
    }

    const protocol = downloadUrl.startsWith('https') ? https : http;
    
    const request = protocol.get(downloadUrl, { 
        headers: { 
            'User-Agent': 'Node.js Download Script'
        }
    }, (response) => {
        // Handle redirects
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            let redirectUrl = response.headers.location;
            // Handle relative redirects
            if (!redirectUrl.startsWith('http')) {
                const urlObj = new URL(downloadUrl);
                redirectUrl = `${urlObj.protocol}//${urlObj.host}${redirectUrl}`;
            }
            console.log(`Redirecting to: ${redirectUrl}`);
            download(redirectUrl, dest, redirectCount + 1);
            return;
        }

        if (response.statusCode !== 200) {
            console.error(`Failed to download: HTTP ${response.statusCode}`);
            process.exit(1);
        }

        const file = fs.createWriteStream(dest);
        response.pipe(file);
        
        file.on('finish', () => {
            file.close();
            console.log(`Downloaded: ${dest}`);
        });

        file.on('error', (err) => {
            fs.unlink(dest, () => {});
            console.error('File write error:', err.message);
            process.exit(1);
        });
    });

    request.on('error', (err) => {
        console.error('Download error:', err.message);
        process.exit(1);
    });
}

console.log(`Downloading: ${url}`);
download(url, outputPath);
