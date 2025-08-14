/**
 * Geometric utility functions using established libraries
 * - Turf.js for geospatial operations (equivalent to Shapely)
 * - Lodash for binary search (equivalent to bisect)
 */
class GeometryUtils {
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
        
        // Convert meters to kilometers since turf.buffer doesn't support meters
        const bufferKilometers = bufferMeters / 1000;
        
        const buffer = turf.buffer(lineString, bufferKilometers, { units: 'kilometers' });
        
        return buffer;
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
     * Get route segment between two distances (includes existing vertices only, no interpolation)
     * @param {Array} routeCoords - Route coordinates
     * @param {Array} cumulativeDistances - Pre-calculated cumulative distances in meters
     * @param {number} startDist - Start distance in kilometers (from route span)
     * @param {number} endDist - End distance in kilometers (from route span)
     * @returns {Array} Array of coordinates for the route segment
     */
    static getRouteSegment(routeCoords, cumulativeDistances, startDist, endDist) {
        if (startDist >= endDist || startDist < 0) {
            return [];
        }
        
        // Convert route span distances from kilometers to meters to match cumulativeDistances
        const startDistMeters = startDist * 1000;
        const endDistMeters = endDist * 1000;
        
        let startIndex = -1;
        let endIndex = -1;
        
        // Find the indices that bracket our distance range
        for (let i = 0; i < cumulativeDistances.length; i++) {
            const currentDistance = cumulativeDistances[i];
            
            if (startIndex === -1 && currentDistance >= startDistMeters) {
                startIndex = Math.max(0, i - 1); // Include one point before if possible
            }
            
            if (currentDistance >= endDistMeters) {
                endIndex = Math.min(routeCoords.length - 1, i + 1); // Include one point after if possible
                break;
            }
        }
        
        // If we didn't find an end index, use the last point
        if (endIndex === -1) {
            endIndex = routeCoords.length - 1;
        }
        
        // If we didn't find a start index, return empty
        if (startIndex === -1) {
            return [];
        }
        
        // Return the subset of route coordinates
        const result = routeCoords.slice(startIndex, endIndex + 1);
        
        return result;
    }
    
    /**
     * Check if brunnel is completely within buffered route using proper geometry testing
     * @param {Array} brunnelCoords - Brunnel coordinates
     * @param {Object} routeBuffer - Buffered route polygon from createRouteBuffer
     * @returns {boolean} True if brunnel is completely within (matches Python shapely.contains)
     */
    static brunnelWithin(brunnelCoords, routeBuffer) {
        // Create brunnel LineString geometry
        const brunnelLine = turf.lineString(brunnelCoords.map(coord => [coord.lon, coord.lat]));
        
        // Get the polygon boundary (exterior ring)
        const polygonBoundary = turf.polygonToLine(routeBuffer);
        
        // Check if brunnel line intersects the polygon boundary
        const intersections = turf.lineIntersect(brunnelLine, polygonBoundary);
        
        // If there are intersections with the boundary, the line is not fully contained
        if (intersections.features.length > 0) {
            return false;
        }
        
        // If no boundary intersections, check if the first point is inside
        const firstPoint = turf.point([brunnelCoords[0].lon, brunnelCoords[0].lat]);
        return turf.booleanPointInPolygon(firstPoint, routeBuffer);
    }
    
    /**
     * Debug containment for a specific brunnel by checking distances to route
     * @param {Array} brunnelCoords - Brunnel coordinates
     * @param {Array} routeCoords - Route coordinates
     * @param {string} brunnelName - Name for debugging
     */
    static debugBrunnelContainment(brunnelCoords, routeCoords, brunnelName) {
        const routeLine = turf.lineString(routeCoords.map(coord => [coord.lon, coord.lat]));
        const brunnelLine = turf.lineString(brunnelCoords.map(coord => [coord.lon, coord.lat]));
        
        console.log(`\n=== DEBUG CONTAINMENT: ${brunnelName} ===`);
        
        // 1) Project brunnel endpoints onto route
        const brunnelStart = turf.point([brunnelCoords[0].lon, brunnelCoords[0].lat]);
        const brunnelEnd = turf.point([brunnelCoords[brunnelCoords.length - 1].lon, brunnelCoords[brunnelCoords.length - 1].lat]);
        
        const startProjection = turf.nearestPointOnLine(routeLine, brunnelStart);
        const endProjection = turf.nearestPointOnLine(routeLine, brunnelEnd);
        
        const startDistance = startProjection.properties.location * 1000; // Convert km to m
        const endDistance = endProjection.properties.location * 1000;
        
        console.log(`Brunnel endpoints project to route at: ${startDistance.toFixed(1)}m - ${endDistance.toFixed(1)}m`);
        
        // 2) Sample route points between projections
        const minDist = Math.min(startDistance, endDistance);
        const maxDist = Math.max(startDistance, endDistance);
        const routeLength = turf.length(routeLine, { units: 'meters' });
        
        console.log(`Checking route segment from ${minDist.toFixed(1)}m to ${maxDist.toFixed(1)}m`);
        
        // Sample every 50m or at least 5 points
        const sampleInterval = Math.min(50, (maxDist - minDist) / 5);
        const maxDistanceToRoute = [];
        
        for (let dist = minDist; dist <= maxDist; dist += sampleInterval) {
            if (dist > routeLength) break;
            
            // 3) Get point on route at this distance
            const routePoint = turf.along(routeLine, dist, { units: 'meters' });
            
            // 4) Project this route point onto brunnel and calculate distance
            const projectionOnBrunnel = turf.nearestPointOnLine(brunnelLine, routePoint);
            const distanceToRoute = turf.distance(routePoint, projectionOnBrunnel, { units: 'meters' });
            
            maxDistanceToRoute.push(distanceToRoute);
            
            if (distanceToRoute > 5) { // Only log significant distances
                console.log(`  Route point at ${dist.toFixed(1)}m is ${distanceToRoute.toFixed(1)}m from brunnel`);
            }
        }
        
        const maxDistanceFound = Math.max(...maxDistanceToRoute);
        console.log(`Maximum distance from route to brunnel: ${maxDistanceFound.toFixed(1)}m`);
        console.log(`Should be contained with 3m buffer: ${maxDistanceFound <= 3}`);
        
        return maxDistanceFound;
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
     * Check if brunnel bearing aligns with route bearing within tolerance using geodetic bearings
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
        
        // Get route segment within the brunnel's span (similar to Python version)
        const routeSegment = this.getRouteSegment(routeCoords, cumulativeDistances, routeSpan.startDistance, routeSpan.endDistance);
        
        if (routeSegment.length < 2) {
            console.log('  Alignment: route segment too short, returning true');
            return true; // Can't determine alignment
        }
        
        console.log(`  Checking alignment: brunnel span ${routeSpan.startDistance.toFixed(3)}-${routeSpan.endDistance.toFixed(3)} km, route segment has ${routeSegment.length} points`);
        
        // Debug: show the route segment distances
        const routeSegmentDistances = [];
        for (let i = 0; i < routeSegment.length; i++) {
            // Find this point in the original route to get its distance
            for (let j = 0; j < routeCoords.length; j++) {
                if (routeCoords[j].lat === routeSegment[i].lat && routeCoords[j].lon === routeSegment[i].lon) {
                    routeSegmentDistances.push((cumulativeDistances[j] / 1000).toFixed(3));
                    break;
                }
            }
        }
        console.log(`  Route segment points at distances: [${routeSegmentDistances.join(', ')}] km`);
        
        let minBearingDiff = Infinity;
        let alignedSegments = [];
        
        // Check each brunnel segment against each route substring segment using rhumb bearings
        for (let i = 0; i < brunnelCoords.length - 1; i++) {
            const brunnelStart = turf.point([brunnelCoords[i].lon, brunnelCoords[i].lat]);
            const brunnelEnd = turf.point([brunnelCoords[i + 1].lon, brunnelCoords[i + 1].lat]);
            const brunnelBearing = turf.rhumbBearing(brunnelStart, brunnelEnd);
            
            for (let j = 0; j < routeSegment.length - 1; j++) {
                const routeStart = turf.point([routeSegment[j].lon, routeSegment[j].lat]);
                const routeEnd = turf.point([routeSegment[j + 1].lon, routeSegment[j + 1].lat]);
                const routeBearing = turf.rhumbBearing(routeStart, routeEnd);
                
                // Calculate bearing difference (handles wrap-around)
                const bearingDiff = this.getBearingDifference(brunnelBearing, routeBearing);
                minBearingDiff = Math.min(minBearingDiff, bearingDiff);
                
                if (bearingDiff <= toleranceDegrees) {
                    console.log(`  ALIGNED: brunnel bearing ${brunnelBearing.toFixed(1)}°, route bearing ${routeBearing.toFixed(1)}°, diff ${bearingDiff.toFixed(1)}° <= ${toleranceDegrees}°`);
                    return true;
                }
            }
        }
        
        console.log(`  NOT ALIGNED: minimum bearing difference ${minBearingDiff.toFixed(1)}° > ${toleranceDegrees}°`);
        return false;
    }
    
    /**
     * Calculate the minimum bearing difference between two bearings (handles wrap-around and reversal)
     * @param {number} bearing1 - First bearing in degrees
     * @param {number} bearing2 - Second bearing in degrees
     * @returns {number} Minimum difference in degrees (0-90, considering both parallel and anti-parallel)
     */
    static getBearingDifference(bearing1, bearing2) {
        let diff = Math.abs(bearing1 - bearing2);
        
        // Handle wrap-around (e.g., 359° and 1° should be 2° apart, not 358°)
        if (diff > 180) {
            diff = 360 - diff;
        }
        
        // Handle reversal: a bridge at 180° should align with a route at 0° 
        // (consider both parallel and anti-parallel alignment)
        if (diff > 90) {
            diff = Math.abs(180 - diff);
        }
        
        return diff;
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