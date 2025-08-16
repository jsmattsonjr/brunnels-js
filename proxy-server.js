#!/usr/bin/env node
/**
 * Local caching proxy server for Overpass API requests
 * Helps avoid 429 rate limit errors by caching responses locally
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const url = require('url');

class OverpassCachingProxy {
    constructor(options = {}) {
        this.port = options.port || 3001;
        this.cacheDir = options.cacheDir || path.join(__dirname, '.overpass-cache');
        this.maxAge = options.maxAge || 24 * 60 * 60 * 1000; // 24 hours default
        this.overpassUrl = 'https://overpass-api.de/api/interpreter';
        this.enableCors = options.enableCors !== false;
        
        // Ensure cache directory exists
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
        
        console.log(`Overpass caching proxy starting...`);
        console.log(`Cache directory: ${this.cacheDir}`);
        console.log(`Cache max age: ${this.maxAge / 1000 / 60 / 60} hours`);
    }
    
    /**
     * Generate cache key from query data
     */
    getCacheKey(queryData) {
        const hash = crypto.createHash('sha256');
        hash.update(queryData);
        return hash.digest('hex');
    }
    
    /**
     * Get cache file path for a query
     */
    getCacheFilePath(cacheKey) {
        return path.join(this.cacheDir, `${cacheKey}.json`);
    }
    
    /**
     * Check if cache entry is valid (not expired)
     */
    isCacheValid(filePath) {
        try {
            const stats = fs.statSync(filePath);
            const age = Date.now() - stats.mtime.getTime();
            return age < this.maxAge;
        } catch (error) {
            return false;
        }
    }
    
    /**
     * Get cached response if available and valid
     */
    getCachedResponse(cacheKey) {
        const filePath = this.getCacheFilePath(cacheKey);
        
        if (fs.existsSync(filePath) && this.isCacheValid(filePath)) {
            try {
                const cachedData = fs.readFileSync(filePath, 'utf8');
                console.log(`✓ Cache hit for ${cacheKey.substring(0, 8)}...`);
                return JSON.parse(cachedData);
            } catch (error) {
                console.warn(`Cache read error for ${cacheKey}: ${error.message}`);
                return null;
            }
        }
        
        return null;
    }
    
    /**
     * Save response to cache
     */
    saveToCache(cacheKey, data) {
        const filePath = this.getCacheFilePath(cacheKey);
        try {
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
            console.log(`✓ Cached response for ${cacheKey.substring(0, 8)}...`);
        } catch (error) {
            console.warn(`Cache write error for ${cacheKey}: ${error.message}`);
        }
    }
    
    /**
     * Make request to Overpass API
     */
    async fetchFromOverpass(queryData) {
        return new Promise((resolve, reject) => {
            const postData = `data=${encodeURIComponent(queryData)}`;
            
            const options = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Content-Length': Buffer.byteLength(postData)
                }
            };
            
            console.log(`→ Requesting from Overpass API...`);
            
            const req = https.request(this.overpassUrl, options, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        try {
                            const jsonData = JSON.parse(data);
                            console.log(`✓ Received response from Overpass API`);
                            resolve(jsonData);
                        } catch (error) {
                            console.error(`JSON parse error: ${error.message}`);
                            reject(new Error(`Invalid JSON response: ${error.message}`));
                        }
                    } else if (res.statusCode === 429) {
                        console.error(`✗ Rate limited by Overpass API (429)`);
                        reject(new Error(`Rate limited (429): Too many requests`));
                    } else {
                        console.error(`✗ Overpass API error: ${res.statusCode} ${res.statusMessage}`);
                        reject(new Error(`Overpass API error: ${res.statusCode} ${res.statusMessage}`));
                    }
                });
            });
            
            req.on('error', (error) => {
                console.error(`✗ Request error: ${error.message}`);
                reject(error);
            });
            
            req.write(postData);
            req.end();
        });
    }
    
    /**
     * Handle proxy request
     */
    async handleRequest(req, res) {
        // Enable CORS headers
        if (this.enableCors) {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        }
        
        // Handle OPTIONS request for CORS preflight
        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }
        
        // Only handle POST requests to /api/interpreter path
        if (req.method !== 'POST' || !req.url.endsWith('/api/interpreter')) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not found' }));
            return;
        }
        
        try {
            // Parse request body
            let body = '';
            req.on('data', (chunk) => {
                body += chunk;
            });
            
            req.on('end', async () => {
                try {
                    // Extract query data from form-encoded body
                    const params = new URLSearchParams(body);
                    const queryData = params.get('data');
                    
                    if (!queryData) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Missing query data' }));
                        return;
                    }
                    
                    const cacheKey = this.getCacheKey(queryData);
                    
                    // Check cache first
                    let responseData = this.getCachedResponse(cacheKey);
                    
                    if (!responseData) {
                        // Cache miss - fetch from Overpass API
                        console.log(`✗ Cache miss for ${cacheKey.substring(0, 8)}...`);
                        responseData = await this.fetchFromOverpass(queryData);
                        
                        // Save to cache
                        this.saveToCache(cacheKey, responseData);
                    }
                    
                    // Return response
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(responseData));
                    
                } catch (error) {
                    console.error(`Request handling error: ${error.message}`);
                    res.writeHead(error.message.includes('Rate limited') ? 429 : 500, { 
                        'Content-Type': 'application/json' 
                    });
                    res.end(JSON.stringify({ error: error.message }));
                }
            });
            
        } catch (error) {
            console.error(`Unexpected error: ${error.message}`);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal server error' }));
        }
    }
    
    /**
     * Start the proxy server
     */
    start() {
        const server = http.createServer((req, res) => {
            this.handleRequest(req, res);
        });
        
        server.listen(this.port, () => {
            console.log(`✓ Overpass caching proxy running on http://localhost:${this.port}`);
            console.log(`  Use http://localhost:${this.port}/api/interpreter instead of Overpass API`);
            console.log(`  Cache directory: ${this.cacheDir}`);
            console.log();
        });
        
        return server;
    }
    
    /**
     * Clean expired cache entries
     */
    cleanCache() {
        console.log('Cleaning expired cache entries...');
        let cleaned = 0;
        
        try {
            const files = fs.readdirSync(this.cacheDir);
            for (const file of files) {
                if (file.endsWith('.json')) {
                    const filePath = path.join(this.cacheDir, file);
                    if (!this.isCacheValid(filePath)) {
                        fs.unlinkSync(filePath);
                        cleaned++;
                    }
                }
            }
            console.log(`✓ Cleaned ${cleaned} expired cache entries`);
        } catch (error) {
            console.warn(`Cache cleaning error: ${error.message}`);
        }
    }
}

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);
    const options = {};
    
    // Parse command line arguments
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        switch (arg) {
            case '--port':
                options.port = parseInt(args[++i]) || 3001;
                break;
            case '--cache-dir':
                options.cacheDir = args[++i];
                break;
            case '--max-age':
                options.maxAge = parseInt(args[++i]) * 1000 || 24 * 60 * 60 * 1000;
                break;
            case '--no-cors':
                options.enableCors = false;
                break;
            case '--clean':
                const proxy = new OverpassCachingProxy(options);
                proxy.cleanCache();
                process.exit(0);
                break;
            case '--help':
                console.log(`
Overpass API Caching Proxy

Usage: node proxy-server.js [options]

Options:
  --port <number>       Port to run proxy on (default: 3001)
  --cache-dir <path>    Cache directory path (default: .overpass-cache)
  --max-age <seconds>   Cache max age in seconds (default: 86400)
  --no-cors            Disable CORS headers
  --clean              Clean expired cache entries and exit
  --help               Show this help

Examples:
  node proxy-server.js                    # Start with defaults
  node proxy-server.js --port 3002        # Custom port
  node proxy-server.js --max-age 7200     # 2 hour cache
  node proxy-server.js --clean            # Clean cache
`);
                process.exit(0);
                break;
        }
    }
    
    const proxy = new OverpassCachingProxy(options);
    proxy.start();
    
    // Clean cache on startup
    proxy.cleanCache();
    
    // Set up graceful shutdown
    process.on('SIGINT', () => {
        console.log('\nShutting down proxy server...');
        process.exit(0);
    });
}

module.exports = OverpassCachingProxy;