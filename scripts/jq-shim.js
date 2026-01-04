#!/usr/bin/env node
// Simple jq replacement for extracting JSON values
// Usage: node jq-shim.js '.key' file.json
// Usage: echo '{"key":"value"}' | node jq-shim.js '.key'
// Usage: node jq-shim.js -r '.key' file.json (raw output without quotes)
// Usage: node jq-shim.js -Rnc '[inputs]' (read lines as JSON array)

const fs = require('fs');

let args = process.argv.slice(2);
let rawOutput = false;
let readLinesMode = false;

// Parse flags
while (args.length > 0 && args[0].startsWith('-')) {
    const flag = args.shift();
    if (flag === '-r') {
        rawOutput = true;
    } else if (flag === '-Rnc') {
        readLinesMode = true;
    } else if (flag.includes('r')) {
        rawOutput = true;
    }
}

if (readLinesMode) {
    // Read stdin line by line and output as JSON array
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => input += chunk);
    process.stdin.on('end', () => {
        const lines = input.trim().split('\n').filter(l => l.length > 0);
        console.log(JSON.stringify(lines));
    });
} else {
    const query = args[0];
    const file = args[1];

    let data;
    if (file) {
        data = JSON.parse(fs.readFileSync(file, 'utf8'));
    } else {
        // Read from stdin
        data = JSON.parse(fs.readFileSync(0, 'utf8'));
    }

    // Simple query parser - supports .key, .key.subkey, del(), pipes
    function evaluate(obj, q) {
        q = q.trim();
        
        // Handle piped expressions
        if (q.includes(' | ')) {
            const parts = q.split(' | ');
            let result = obj;
            for (const part of parts) {
                result = evaluate(result, part.trim());
            }
            return result;
        }
        
        // Handle del()
        if (q.startsWith('del(')) {
            const match = q.match(/del\(([^)]+)\)/);
            if (match) {
                const keys = match[1].split(',').map(k => k.trim().replace(/^\./, ''));
                const result = { ...obj };
                for (const key of keys) {
                    delete result[key];
                }
                return result;
            }
        }
        
        // Handle assignment .key = value
        if (q.includes(' = ')) {
            const [keyPart, valuePart] = q.split(' = ');
            const key = keyPart.trim().replace(/^\./, '');
            let value = valuePart.trim();
            // Remove quotes if present
            if (value.startsWith('"') && value.endsWith('"')) {
                value = value.slice(1, -1);
            }
            return { ...obj, [key]: value };
        }
        
        // Handle simple .key or .key.subkey
        if (q.startsWith('.')) {
            const keys = q.slice(1).split('.');
            let result = obj;
            for (const key of keys) {
                if (key && result !== undefined) {
                    result = result[key];
                }
            }
            return result;
        }
        
        return obj;
    }

    const result = evaluate(data, query);
    
    if (typeof result === 'string' && rawOutput) {
        console.log(result);
    } else if (typeof result === 'object') {
        console.log(JSON.stringify(result, null, 2));
    } else {
        console.log(JSON.stringify(result));
    }
}
