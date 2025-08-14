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
     * Determine if element is a bridge or tunnel
     */
    static determineBrunnelType(tags) {
        if (tags.bridge && tags.bridge !== 'no') {
            return 'bridge';
        }
        if (tags.tunnel && tags.tunnel !== 'no') {
            return 'tunnel';
        }
        return null;
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
     * Expand bounding box by buffer distance
     * @param {Object} bounds - Original bounds
     * @param {number} bufferMeters - Buffer distance in meters
     * @returns {Object} Expanded bounds
     */
    static expandBounds(bounds, bufferMeters) {
        // Approximate conversion: 1 degree ≈ 111,320 meters at equator
        // This is a rough approximation, but sufficient for query purposes
        const latBuffer = bufferMeters / 111320;
        const lonBuffer = bufferMeters / (111320 * Math.cos(bounds.center.lat * Math.PI / 180));
        
        return {
            minLat: bounds.minLat - latBuffer,
            maxLat: bounds.maxLat + latBuffer,
            minLon: bounds.minLon - lonBuffer,
            maxLon: bounds.maxLon + lonBuffer,
            center: bounds.center
        };
    }
}