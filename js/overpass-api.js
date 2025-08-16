/**
 * Overpass API client for querying OpenStreetMap data
 */
class OverpassAPI {
    static OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
    
    /**
     * Query bridges and tunnels near a route
     * @param {Object} bounds - Bounding box {minLat, maxLat, minLon, maxLon}
     * @param {Object} options - Query options
     * @returns {Promise<Object>} OpenStreetMap data
     */
    static async queryBrunnels(bounds, options = {}) {
        const {
            timeout = 30,
            includeBicycleNo = false,
            includeWaterways = false,
            includeActiveRailways = false
        } = options;
        
        const query = this.buildOverpassQuery(bounds, {
            timeout,
            includeBicycleNo,
            includeWaterways,
            includeActiveRailways
        });
        
        try {
            const response = await fetch(this.OVERPASS_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: `data=${encodeURIComponent(query)}`
            });
            
            if (!response.ok) {
                throw new Error(`Overpass API error: ${response.status} ${response.statusText}`);
            }
            
            const data = await response.json();
            return this.processOverpassData(data);
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Request timed out. Try increasing the timeout or reducing the search area.');
            }
            throw error;
        }
    }
    
    /**
     * Build Overpass QL query for bridges and tunnels - matches Python implementation exactly
     */
    static buildOverpassQuery(bounds, options) {
        const { timeout, includeBicycleNo, includeWaterways, includeActiveRailways } = options;
        const south = bounds.minLat;
        const west = bounds.minLon;
        const north = bounds.maxLat;
        const east = bounds.maxLon;
        
        // Build base filters exactly like Python
        let baseFilters = '';
        if (!includeWaterways) {
            baseFilters += '[!waterway]';
        }
        if (!includeBicycleNo) {
            baseFilters += '["bicycle"!="no"]';
        }
        
        // Build railway exclusions exactly like Python
        let bridgeRailwayExclusion = '';
        let tunnelRailwayExclusion = '';
        
        if (!includeActiveRailways) {
            const activeRailwayTypes = 'rail|light_rail|subway|tram|narrow_gauge|funicular|monorail|miniature|preserved';
            const railwayExclusion = `["railway"~"^(${activeRailwayTypes})$"]${baseFilters}(if:!is_closed());`;
            bridgeRailwayExclusion = `\n  - way[bridge]${railwayExclusion}`;
            tunnelRailwayExclusion = `\n  - way[tunnel]${railwayExclusion}`;
        }
        
        // Build complete query exactly like Python
        return `[out:json][timeout:${timeout}][bbox:${south},${west},${north},${east}];
(
  (
    way[bridge]${baseFilters}(if:!is_closed());${bridgeRailwayExclusion}
  );
  way[bridge][highway=cycleway](if:!is_closed());
);
out count;
out geom qt;
(
  (
    way[tunnel]${baseFilters}(if:!is_closed());${tunnelRailwayExclusion}
  );
  way[tunnel][highway=cycleway](if:!is_closed());
);
out count;
out geom qt;`;
    }
    
    /**
     * Process Overpass API response data - matches Python implementation exactly
     */
    static processOverpassData(data) {
        const brunnels = {
            bridges: [],
            tunnels: []
        };
        
        if (!data.elements) {
            return brunnels;
        }
        
        let currentType = null;
        
        data.elements.forEach(element => {
            if (element.type === 'count') {
                // First count is bridges, second count is tunnels
                currentType = currentType === 'bridges' ? 'tunnels' : 'bridges';
            } else if (element.type === 'way' && element.geometry) {
                const brunnel = {
                    id: element.id,
                    tags: element.tags || {},
                    geometry: element.geometry.map(node => ({
                        lat: node.lat,
                        lon: node.lon
                    })),
                    nodes: element.nodes || [], // Store node IDs for compound detection
                    type: currentType === 'bridges' ? 'bridge' : 'tunnel',
                    name: this.extractName(element.tags)
                };
                
                if (currentType === 'bridges') {
                    brunnels.bridges.push(brunnel);
                } else if (currentType === 'tunnels') {
                    brunnels.tunnels.push(brunnel);
                }
            }
        });
        
        return brunnels;
    }
    
    
    /**
     * Extract human-readable name from OSM tags
     */
    static extractName(tags) {
        // Try various name tags in order of preference
        const nameKeys = ['name', 'name:en', 'ref', 'bridge:name', 'tunnel:name'];
        
        for (const key of nameKeys) {
            if (tags[key]) {
                return tags[key];
            }
        }
        
        // Generate descriptive name from tags
        const type = tags.bridge ? 'Bridge' : 'Tunnel';
        
        if (tags.highway) {
            return `${type} (${tags.highway})`;
        }
        
        return type;
    }
    
    /**
     * Break route into chunks for separate Overpass queries based on bounding box size
     * @param {Array} routeCoords - Route coordinates
     * @param {number} bufferMeters - Buffer around each chunk in meters
     * @returns {Array} Array of {startIdx, endIdx, bounds} objects for each chunk
     */
    static chunkRouteForQueries(routeCoords, bufferMeters = 10.0) {
        // Maximum bounding box size in square degrees
        // Roughly equivalent to 50,000 km² at equator (50000 / 111² ≈ 4.06)
        const MAX_DEGREES_SQUARED = 4.0;
        
        const chunks = [];
        let startIdx = 0;
        let cumulativeDistance = 0.0;
        
        // Initialize bounding box with first coordinate
        const firstCoord = routeCoords[0];
        let minLat = firstCoord.lat;
        let maxLat = firstCoord.lat;
        let minLon = firstCoord.lon;
        let maxLon = firstCoord.lon;
        
        for (let i = 1; i < routeCoords.length; i++) {
            const prevCoord = routeCoords[i - 1];
            const currCoord = routeCoords[i];
            
            // Calculate distance for logging (Haversine formula)
            const lat1 = prevCoord.lat * Math.PI / 180;
            const lon1 = prevCoord.lon * Math.PI / 180;
            const lat2 = currCoord.lat * Math.PI / 180;
            const lon2 = currCoord.lon * Math.PI / 180;
            
            const dlat = lat2 - lat1;
            const dlon = lon2 - lon1;
            const a = Math.sin(dlat / 2) ** 2 + 
                     Math.cos(lat1) * Math.cos(lat2) * Math.sin(dlon / 2) ** 2;
            const distance = 2 * 6371000 * Math.asin(Math.sqrt(a)); // Earth radius in meters
            cumulativeDistance += distance;
            
            // Update bounding box incrementally
            minLat = Math.min(minLat, currCoord.lat);
            maxLat = Math.max(maxLat, currCoord.lat);
            minLon = Math.min(minLon, currCoord.lon);
            maxLon = Math.max(maxLon, currCoord.lon);
            
            // Fast bounding box size check using degrees
            const latDiff = maxLat - minLat;
            const lonDiff = maxLon - minLon;
            const degreesSquared = latDiff * lonDiff;
            
            // Create chunk when we exceed size threshold or reach the end
            if (degreesSquared >= MAX_DEGREES_SQUARED || i === routeCoords.length - 1) {
                // Add buffer in degrees (approximate)
                const avgLat = (minLat + maxLat) / 2;
                const latBuffer = bufferMeters / 111000.0;
                const lonBuffer = bufferMeters / (111000.0 * Math.abs(Math.cos(avgLat * Math.PI / 180)));
                
                const bounds = {
                    minLat: Math.max(-90.0, minLat - latBuffer),
                    minLon: Math.max(-180.0, minLon - lonBuffer),
                    maxLat: Math.min(90.0, maxLat + latBuffer),
                    maxLon: Math.min(180.0, maxLon + lonBuffer)
                };
                
                chunks.push({ startIdx, endIdx: i, bounds });
                
                // Calculate approximate area for logging
                const approxAreaSqKm = degreesSquared * 111.0 * 111.0;
                console.log(
                    `Chunk ${chunks.length}: points ${startIdx}-${i} ` +
                    `(${(cumulativeDistance/1000).toFixed(1)}km), ` +
                    `area: ${approxAreaSqKm.toFixed(1)} sq km`
                );
                
                // Start next chunk and reset bounding box to current coordinate
                startIdx = i;
                cumulativeDistance = 0.0;
                minLat = currCoord.lat;
                maxLat = currCoord.lat;
                minLon = currCoord.lon;
                maxLon = currCoord.lon;
            }
        }
        
        return chunks;
    }
    
    /**
     * Query brunnels using chunked approach for long routes
     * @param {Array} routeCoords - Route coordinates
     * @param {Object} options - Query options
     * @returns {Promise<Object>} Merged brunnel data
     */
    static async queryBrunnelsChunked(routeCoords, options = {}) {
        const { queryBuffer = 10 } = options;
        const chunks = this.chunkRouteForQueries(routeCoords, queryBuffer);
        
        // Calculate total route length for logging
        let totalDistance = 0;
        for (let i = 1; i < routeCoords.length; i++) {
            const prev = routeCoords[i - 1];
            const curr = routeCoords[i];
            const lat1 = prev.lat * Math.PI / 180;
            const lon1 = prev.lon * Math.PI / 180;
            const lat2 = curr.lat * Math.PI / 180;
            const lon2 = curr.lon * Math.PI / 180;
            const dlat = lat2 - lat1;
            const dlon = lon2 - lon1;
            const a = Math.sin(dlat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dlon / 2) ** 2;
            totalDistance += 2 * 6371000 * Math.asin(Math.sqrt(a));
        }
        
        console.log(
            `Long route (${(totalDistance/1000).toFixed(1)}km) - ` +
            `breaking into ${chunks.length} chunks for Overpass queries`
        );
        
        const allBridges = [];
        const allTunnels = [];
        let totalAreaSqKm = 0.0;
        
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            
            // Calculate chunk area for logging
            const latDiff = chunk.bounds.maxLat - chunk.bounds.minLat;
            const lonDiff = chunk.bounds.maxLon - chunk.bounds.minLon;
            const avgLat = (chunk.bounds.maxLat + chunk.bounds.minLat) / 2;
            const latKm = latDiff * 111.0;
            const lonKm = lonDiff * 111.0 * Math.abs(Math.cos(avgLat * Math.PI / 180));
            const areaSqKm = latKm * lonKm;
            totalAreaSqKm += areaSqKm;
            
            console.log(
                `Chunk ${i+1}/${chunks.length}: querying ${areaSqKm.toFixed(1)} sq km area ` +
                `(points ${chunk.startIdx}-${chunk.endIdx})`
            );
            
            // Query this chunk
            const chunkData = await this.queryBrunnels(chunk.bounds, options);
            allBridges.push(...chunkData.bridges);
            allTunnels.push(...chunkData.tunnels);
        }
        
        console.log(
            `Completed ${chunks.length} chunked queries covering ${totalAreaSqKm.toFixed(1)} sq km total`
        );
        
        // Merge results by OSM ID to remove duplicates
        const bridgesById = new Map();
        const tunnelsById = new Map();
        
        for (const bridge of allBridges) {
            bridgesById.set(bridge.id, bridge);
        }
        
        for (const tunnel of allTunnels) {
            tunnelsById.set(tunnel.id, tunnel);
        }
        
        const mergedBridges = Array.from(bridgesById.values());
        const mergedTunnels = Array.from(tunnelsById.values());
        
        console.log(
            `Merged results: ${mergedBridges.length} unique bridges, ` +
            `${mergedTunnels.length} unique tunnels ` +
            `(removed ${allBridges.length - mergedBridges.length} duplicate bridges, ` +
            `${allTunnels.length - mergedTunnels.length} duplicate tunnels)`
        );
        
        return {
            bridges: mergedBridges,
            tunnels: mergedTunnels
        };
    }
}