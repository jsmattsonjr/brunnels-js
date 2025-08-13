/**
 * Geometric utility functions using established libraries
 * - Turf.js for geospatial operations (equivalent to Shapely)
 * - proj4js for coordinate projections (equivalent to pyproj)
 * - Lodash for binary search (equivalent to bisect)
 */
class GeometryUtils {
    /**
     * Create a custom transverse mercator projection centered on the given bounding box
     * @param {Object} bounds - Bounding box {minLat, maxLat, minLon, maxLon}
     * @returns {Function} proj4 projection function
     */
    static createTransverseMercatorProjection(bounds) {
        // Calculate center of bounding box for projection center (matches Python)
        const centerLat = (bounds.minLat + bounds.maxLat) / 2.0;
        const centerLon = (bounds.minLon + bounds.maxLon) / 2.0;
        
        // Create custom transverse mercator projection string (matches Python exactly)
        const projString = `+proj=tmerc +lat_0=${centerLat} +lon_0=${centerLon} +k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs`;
        
        // Return projection definition for use with proj4
        return projString;
    }

    /**
     * Create a buffered geometry around a route using Turf
     * @param {Array} routeCoords - Route coordinates [{lat, lon}, ...]
     * @param {number} bufferMeters - Buffer distance in meters
     * @returns {Object} GeoJSON polygon representing buffered route
     */
    static createRouteBuffer(routeCoords, bufferMeters) {
        const lineString = turf.lineString(
            routeCoords.map(coord => [coord.lon, coord.lat])
        );
        return turf.buffer(lineString, bufferMeters, { units: 'meters' });
    }
    
    /**
     * Pre-calculate cumulative distances along route using Turf
     * @param {Array} routeCoords - Route coordinates
     * @returns {Array} Cumulative distances in meters
     */
    static calculateCumulativeDistances(routeCoords) {
        const distances = [0];
        let totalDistance = 0;
        
        for (let i = 1; i < routeCoords.length; i++) {
            const segmentDistance = turf.distance(
                turf.point([routeCoords[i-1].lon, routeCoords[i-1].lat]),
                turf.point([routeCoords[i].lon, routeCoords[i].lat]),
                { units: 'meters' }
            );
            totalDistance += segmentDistance;
            distances.push(totalDistance);
        }
        
        return distances;
    }
    
    /**
     * Get substring of route between two distances (simplified version of Shapely's substring)
     * Only handles positive distances, no interpolation - just returns existing vertices
     * @param {Array} routeCoords - Route coordinates
     * @param {Array} cumulativeDistances - Pre-calculated cumulative distances
     * @param {number} startDist - Start distance in meters
     * @param {number} endDist - End distance in meters
     * @returns {Array} Array of coordinates for the substring
     */
    static substring(routeCoords, cumulativeDistances, startDist, endDist) {
        if (startDist >= endDist || startDist < 0) {
            return [];
        }
        
        const vertexList = [];
        
        // Find vertices that fall within the distance range
        for (let i = 0; i < routeCoords.length; i++) {
            const currentDistance = cumulativeDistances[i];
            if (startDist < currentDistance && currentDistance < endDist) {
                vertexList.push(routeCoords[i]);
            } else if (currentDistance >= endDist) {
                break;
            }
        }
        
        return vertexList;
    }
    
    /**
     * Check if brunnel is completely contained within buffered route using Turf
     * @param {Array} brunnelCoords - Brunnel coordinates
     * @param {Object} routeBuffer - Buffered route polygon from createRouteBuffer
     * @returns {boolean} True if brunnel is completely contained (matches Python shapely.contains)
     */
    static brunnelIsContainedBy(brunnelCoords, routeBuffer) {
        // Create brunnel LineString geometry
        const brunnelLine = turf.lineString(brunnelCoords.map(coord => [coord.lon, coord.lat]));
        
        // Use turf.booleanContains to match Python's shapely.contains()
        // Returns true if routeBuffer completely contains the brunnel
        return turf.booleanContains(routeBuffer, brunnelLine);
    }
    
    /**
     * Calculate route spans where brunnel projects onto the route using Turf.js (WGS84)
     * @param {Array} brunnelCoords - Brunnel coordinates
     * @param {Array} routeCoords - Route coordinates
     * @param {number} bufferMeters - Buffer distance in meters (not used in route span calculation)
     * @returns {Object|null} Route span {startDistance, endDistance} or null
     */
    static calculateRouteSpan(brunnelCoords, routeCoords, bufferMeters) {
        try {
            // Create route line using WGS84 coordinates - let Turf handle projections internally
            const routeLine = turf.lineString(routeCoords.map(coord => [coord.lon, coord.lat]));
            
            let minDistance = Infinity;
            let maxDistance = -Infinity;
            
            // Project each brunnel point onto the route using WGS84 coordinates
            for (const coord of brunnelCoords) {
                const point = turf.point([coord.lon, coord.lat]);
                const nearest = turf.nearestPointOnLine(routeLine, point);
                
                // Distance along route where this point projects (Turf handles the geodesic calculations)
                const distanceAlongRoute = nearest.properties.location;
                minDistance = Math.min(minDistance, distanceAlongRoute);
                maxDistance = Math.max(maxDistance, distanceAlongRoute);
            }
            
            const result = {
                startDistance: minDistance,
                endDistance: maxDistance
            };
            
            return result;
            
        } catch (error) {
            console.error('Error in calculateRouteSpan:', error);
            return null;
        }
    }
    
    /**
     * Check if brunnel bearing aligns with route bearing within tolerance
     * Uses route substring (like Python version) for the alignment test
     * @param {Array} brunnelCoords - Brunnel coordinates
     * @param {Array} routeCoords - Route coordinates
     * @param {Array} cumulativeDistances - Pre-calculated cumulative distances
     * @param {Object} routeSpan - Route span {startDistance, endDistance}
     * @param {number} toleranceDegrees - Tolerance in degrees
     * @returns {boolean} True if aligned
     */
    static isBrunnelAligned(brunnelCoords, routeCoords, cumulativeDistances, routeSpan, toleranceDegrees) {
        if (brunnelCoords.length < 2 || routeCoords.length < 2 || !routeSpan) {
            return true;
        }
        
        const toleranceRadians = toleranceDegrees * Math.PI / 180;
        const cosThreshold = Math.cos(toleranceRadians);
        
        // Get route substring within the brunnel's span (like Python version)
        const routeSubstring = this.substring(routeCoords, cumulativeDistances, routeSpan.startDistance, routeSpan.endDistance);
        
        if (routeSubstring.length < 2) {
            return true; // Can't determine alignment
        }
        
        // Check each brunnel segment against each route substring segment
        for (let i = 0; i < brunnelCoords.length - 1; i++) {
            const brunnelVector = this.getUnitVector(brunnelCoords[i], brunnelCoords[i + 1]);
            
            for (let j = 0; j < routeSubstring.length - 1; j++) {
                const routeVector = this.getUnitVector(routeSubstring[j], routeSubstring[j + 1]);
                
                // Check both parallel and anti-parallel alignment using dot product
                const dotProduct = Math.abs(
                    brunnelVector.x * routeVector.x + brunnelVector.y * routeVector.y
                );
                
                if (dotProduct >= cosThreshold) {
                    return true;
                }
            }
        }
        
        return false;
    }
    
    /**
     * Get unit vector between two points
     */
    static getUnitVector(point1, point2) {
        const dx = point2.lon - point1.lon;
        const dy = point2.lat - point1.lat;
        const length = Math.sqrt(dx * dx + dy * dy);
        
        return {
            x: dx / length,
            y: dy / length
        };
    }
    
    /**
     * Calculate total distance of route using Turf
     */
    static calculateRouteDistance(routeCoords) {
        const lineString = turf.lineString(
            routeCoords.map(coord => [coord.lon, coord.lat])
        );
        return turf.length(lineString, { units: 'meters' });
    }
    
    /**
     * Calculate bounds of coordinates using Turf
     */
    static calculateBounds(coords) {
        const points = coords.map(coord => turf.point([coord.lon, coord.lat]));
        const bbox = turf.bbox(turf.featureCollection(points));
        
        return {
            minLon: bbox[0],
            minLat: bbox[1], 
            maxLon: bbox[2],
            maxLat: bbox[3],
            center: {
                lon: (bbox[0] + bbox[2]) / 2,
                lat: (bbox[1] + bbox[3]) / 2
            }
        };
    }
    
    /**
     * Expand bounding box by buffer distance
     */
    static expandBounds(bounds, bufferMeters) {
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