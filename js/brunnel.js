/**
 * Brunnel class representing bridges and tunnels
 * Equivalent to Python Brunnel class
 */
class Brunnel {
    constructor(data) {
        this.id = data.id;
        this.type = data.type; // 'bridge' or 'tunnel'
        this.name = data.name;
        this.tags = data.tags;
        this.geometry = data.geometry; // Array of {lat, lon} coordinates
        this.nodes = data.nodes || []; // OSM node IDs for compound detection
        this.routeSpan = null; // Will be set during analysis
        this.exclusionReason = null; // null = included, or reason string
        this.selected = true; // User selection state for UI (initially true, updated after filtering)
        this.overlapGroup = null; // For handling overlapping brunnels
        this.compoundGroup = null; // Array of Brunnel instances in compound group
        this.displayName = this.name || this.extractNameFromTags(this.tags, this.type);
    }
    
    /**
     * Create Brunnel instances from Overpass API response
     * @param {Object} overpassData - Response from OverpassAPI.queryBrunnels()
     * @returns {Array} Array of Brunnel instances
     */
    static fromOverpassData(overpassData) {
        const brunnels = [];
        
        // Process bridges
        for (const bridge of overpassData.bridges) {
            brunnels.push(new Brunnel({
                id: bridge.id,
                type: 'bridge',
                name: bridge.name,
                tags: bridge.tags,
                geometry: bridge.geometry,
                nodes: bridge.nodes || []
            }));
        }
        
        // Process tunnels
        for (const tunnel of overpassData.tunnels) {
            brunnels.push(new Brunnel({
                id: tunnel.id,
                type: 'tunnel',
                name: tunnel.name,
                tags: tunnel.tags,
                geometry: tunnel.geometry,
                nodes: tunnel.nodes || []
            }));
        }
        
        return brunnels;
    }
    
    /**
     * Check if brunnel is within route buffer - matches Python is_contained_by()
     * @param {Object} routeBuffer - Buffered route geometry  
     * @returns {boolean} True if within
     */
    isWithin(routeBuffer) {
        const isWithin = GeometryUtils.brunnelWithin(this.geometry, routeBuffer);
        
        return isWithin;
    }
    
    
    /**
     * Calculate route span where this brunnel intersects the route
     * @param {Array} routeCoords - Route coordinates
     * @param {number} bufferMeters - Buffer distance
     */
    calculateRouteSpan(routeCoords, bufferMeters) {
        this.routeSpan = GeometryUtils.calculateRouteSpan(
            this.geometry, 
            routeCoords
        );
        
    }
    
    /**
     * Check if brunnel is aligned with route within tolerance
     * @param {Array} routeCoords - Route coordinates
     * @param {Array} cumulativeDistances - Pre-calculated distances
     * @param {number} toleranceDegrees - Tolerance in degrees
     * @returns {boolean} True if aligned
     */
    isAligned(routeCoords, cumulativeDistances, toleranceDegrees) {
        if (!this.routeSpan) {
            return true;
        }
        
        const aligned = GeometryUtils.isBrunnelAligned(
            this.geometry,
            routeCoords,
            cumulativeDistances,
            this.routeSpan,
            toleranceDegrees
        );
        
        return aligned;
    }
    
    /**
     * Initialize selected state based on exclusionReason (call after filtering)
     */
    initializeSelectedState() {
        this.selected = this.isIncluded();
    }
    
    /**
     * Check if this brunnel is the representative of its compound group
     * @returns {boolean} True if representative (or not in a compound)
     */
    isRepresentative() {
        if (!this.compoundGroup || this.compoundGroup.length <= 1) {
            return true;
        }
        // Representative is the first brunnel in the sorted group
        const sorted = [...this.compoundGroup].sort((a, b) => 
            (a.routeSpan?.startDistance || 0) - (b.routeSpan?.startDistance || 0)
        );
        return sorted[0] === this;
    }

    /**
     * Get compound ID - semicolon-separated OSM IDs for compounds
     * @returns {string} Compound ID
     */
    getCompoundId() {
        if (!this.compoundGroup || this.compoundGroup.length <= 1) {
            return this.id.toString();
        }
        return this.compoundGroup
            .map(b => b.id)
            .sort((a, b) => a - b)
            .join(';');
    }

    /**
     * Get display name for the brunnel (combines compound names)
     * @returns {string} Display name
     */
    getDisplayName() {
        if (this.compoundGroup && this.compoundGroup.length > 1) {
            // For compound brunnels, combine unique display names
            const names = this.compoundGroup
                .map(b => b.displayName)
                .filter((name, index, arr) => arr.indexOf(name) === index); // unique names
                
            return `${names.join(', ')} (${this.getCompoundId()})`;
        }
        
        // Single brunnel display
        return `${this.displayName} (${this.id})`;
    }
    
    /**
     * Capitalize the first letter of a string
     * @param {string} str - String to capitalize
     * @returns {string} String with first letter capitalized
     */
    static initialCap(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }

    /**
     * Extract a meaningful name from OSM tags for display
     * @param {Object} tags - OSM tags
     * @param {string} type - brunnel type ('bridge' or 'tunnel')
     * @returns {string} Display name
     */
    extractNameFromTags(tags, type) {
        // Check for highway tag and capitalize it
        if (tags.highway) {
            return Brunnel.initialCap(tags.highway);
        }
        
        // Check for railway tag and capitalize it
        if (tags.railway) {
            return Brunnel.initialCap(tags.railway);
        }
        
        // Fallback to generic type name
        return Brunnel.initialCap(type);
    }

    /**
     * Get route span for compound brunnel (from first to last component)
     * @returns {Object|null} Route span or null
     */
    getCompoundRouteSpan() {
        if (!this.compoundGroup || this.compoundGroup.length <= 1) {
            return this.routeSpan;
        }
        
        const spans = this.compoundGroup
            .map(b => b.routeSpan)
            .filter(span => span !== null);
            
        if (spans.length === 0) {
            return null;
        }
        
        const startDistance = Math.min(...spans.map(s => s.startDistance));
        const endDistance = Math.max(...spans.map(s => s.endDistance));
        
        return {
            startDistance,
            endDistance
        };
    }
    
    /**
     * Get route span as string for display
     * @returns {string} Route span description
     */
    getRouteSpanString() {
        const span = this.getCompoundRouteSpan();
        if (!span) {
            return 'No span';
        }
        
        // Route span distances are already in kilometers from turf.nearestPointOnLine
        const startKm = span.startDistance.toFixed(2);
        const endKm = span.endDistance.toFixed(2);
        const lengthKm = (span.endDistance - span.startDistance).toFixed(2);
        
        return `${startKm}-${endKm} km (${lengthKm} km)`;
    }
    
    /**
     * Check if brunnel is included (not excluded)
     * @returns {boolean} True if included
     */
    isIncluded() {
        return this.exclusionReason === null;
    }
    
    /**
     * Get color for map display based on type and status
     * @returns {string} CSS color
     */
    getMapColor() {
        if (!this.selected) {
            // Unselected brunnels in muted colors
            return this.type === 'bridge' ? '#ffcccb' : '#e6ccff';
        }
        
        // Selected brunnels in bright colors
        return this.type === 'bridge' ? '#e74c3c' : '#9b59b6';
    }
    
    /**
     * Get weight for map display
     * @returns {number} Line weight
     */
    getMapWeight() {
        return this.selected ? 4 : 2;
    }
    
    /**
     * Get opacity for map display
     * @returns {number} Opacity (0-1)
     */
    getMapOpacity() {
        return this.selected ? 0.8 : 0.4;
    }
}

/**
 * Brunnel analysis utilities
 */
class BrunnelAnalysis {
    /**
     * Filter brunnels that are within route buffer
     * @param {Array} brunnels - Array of Brunnel instances
     * @param {Object} routeBuffer - Buffered route geometry
     */
    static filterContained(brunnels, routeBuffer, routeCoords) {
        const contained = brunnels.filter(brunnel => {
            const isWithin = brunnel.isWithin(routeBuffer);
            if (!isWithin) {
                brunnel.exclusionReason = 'outlier';
            }
            return isWithin;
        });
        console.log(`Containment filter: ${contained.length}/${brunnels.length} brunnels within route buffer`);
        return contained;
    }
    
    /**
     * Calculate route spans for all brunnels
     * @param {Array} brunnels - Array of Brunnel instances
     * @param {Array} routeCoords - Route coordinates
     * @param {number} bufferMeters - Buffer distance
     */
    static calculateRouteSpans(brunnels, routeCoords, bufferMeters) {
        for (const brunnel of brunnels) {
            brunnel.calculateRouteSpan(routeCoords, bufferMeters);
        }
    }

    /**
     * Find compound brunnels by detecting connected components
     * @param {Array} brunnels - Array of Brunnel instances
     */
    static findCompoundBrunnels(brunnels) {
        // Separate by type - only same types can form compounds
        const bridges = brunnels.filter(b => b.type === 'bridge');
        const tunnels = brunnels.filter(b => b.type === 'tunnel');
        
        this._processCompoundBrunnelsForType(bridges);
        this._processCompoundBrunnelsForType(tunnels);
    }
    
    /**
     * Process compound brunnels for a specific type
     * @param {Array} brunnels - Array of Brunnel instances of same type
     * @private
     */
    static _processCompoundBrunnelsForType(brunnels) {
        if (brunnels.length <= 1) return;
        
        const edges = this._buildNodeEdgesMap(brunnels);
        const components = this._findConnectedComponents(brunnels, edges);
        this._createCompoundGroups(brunnels, components);
    }
    
    /**
     * Build edges map: node_id -> array of brunnel indices
     * @param {Array} brunnels - Array of Brunnel instances
     * @returns {Map} Node edges map
     * @private
     */
    static _buildNodeEdgesMap(brunnels) {
        const edges = new Map();
        
        brunnels.forEach((brunnel, index) => {
            if (brunnel.nodes && brunnel.nodes.length > 0) {
                brunnel.nodes.forEach(nodeId => {
                    if (!edges.has(nodeId)) {
                        edges.set(nodeId, []);
                    }
                    edges.get(nodeId).push(index);
                });
            }
        });
        
        return edges;
    }
    
    /**
     * Find connected components using breadth-first search
     * @param {Array} brunnels - Array of Brunnel instances
     * @param {Map} edges - Node edges map
     * @returns {Array} Array of component arrays (each containing brunnel indices)
     * @private
     */
    static _findConnectedComponents(brunnels, edges) {
        const visited = new Set();
        const components = [];
        
        for (let i = 0; i < brunnels.length; i++) {
            if (visited.has(i)) continue;
            
            const component = this._findConnectedComponentBFS(brunnels, edges, i, visited);
            if (component.length > 0) {
                components.push(component);
            }
        }
        
        return components;
    }
    
    /**
     * Find connected component using BFS starting from given brunnel index
     * @param {Array} brunnels - Array of Brunnel instances
     * @param {Map} edges - Node edges map
     * @param {number} startIndex - Starting brunnel index
     * @param {Set} visited - Set of visited indices
     * @returns {Array} Array of brunnel indices in component
     * @private
     */
    static _findConnectedComponentBFS(brunnels, edges, startIndex, visited) {
        const component = [];
        const queue = [startIndex];
        
        while (queue.length > 0) {
            const currentIndex = queue.shift();
            if (visited.has(currentIndex)) continue;
            
            visited.add(currentIndex);
            component.push(currentIndex);
            
            const currentBrunnel = brunnels[currentIndex];
            if (currentBrunnel.nodes) {
                // Find all brunnels sharing nodes with current brunnel
                currentBrunnel.nodes.forEach(nodeId => {
                    if (edges.has(nodeId)) {
                        edges.get(nodeId).forEach(neighborIndex => {
                            if (!visited.has(neighborIndex)) {
                                queue.push(neighborIndex);
                            }
                        });
                    }
                });
            }
        }
        
        return component;
    }
    
    /**
     * Create compound groups for components with multiple brunnels
     * @param {Array} brunnels - Array of Brunnel instances
     * @param {Array} components - Array of component arrays
     * @private
     */
    static _createCompoundGroups(brunnels, components) {
        components.forEach(componentIndices => {
            if (componentIndices.length > 1) {
                const compoundGroup = componentIndices.map(index => brunnels[index]);
                
                // Set compound group for each brunnel
                compoundGroup.forEach(brunnel => {
                    brunnel.compoundGroup = compoundGroup;
                });
                
                console.log(`Found compound ${brunnels[0].type} with ${componentIndices.length} segments: ${compoundGroup.map(b => b.id).join(', ')}`);
            }
        });
    }
    
    /**
     * Filter brunnels by bearing alignment
     * @param {Array} brunnels - Array of Brunnel instances
     * @param {Array} routeCoords - Route coordinates
     * @param {Array} cumulativeDistances - Pre-calculated distances
     * @param {number} toleranceDegrees - Tolerance in degrees
     */
    static filterAligned(brunnels, routeCoords, cumulativeDistances, toleranceDegrees) {
        let alignedCount = 0;
        for (const brunnel of brunnels) {
            if (brunnel.isIncluded()) {
                if (brunnel.isAligned(routeCoords, cumulativeDistances, toleranceDegrees)) {
                    alignedCount++;
                } else {
                    brunnel.exclusionReason = 'misaligned';
                }
            }
        }
        console.log(`Alignment filter: ${alignedCount}/${brunnels.filter(b => b.exclusionReason !== 'outlier').length} brunnels aligned within ${toleranceDegrees}° tolerance`);
    }
    
    /**
     * Handle overlapping brunnels - only considers representative brunnels (compound group leaders)
     * @param {Array} brunnels - Array of Brunnel instances
     * @param {Array} routeCoords - Route coordinates for distance calculation
     */
    static handleOverlaps(brunnels, routeCoords) {
        const includedBrunnels = brunnels.filter(b => 
            b.isIncluded() && 
            b.routeSpan && 
            b.isRepresentative()
        );
        
        // Group by overlapping route spans
        const overlapGroups = [];
        
        for (const brunnel of includedBrunnels) {
            let foundGroup = false;
            
            for (const group of overlapGroups) {
                // Check if this brunnel overlaps with any in the group
                const overlaps = group.some(other => 
                    this.routeSpansOverlap(brunnel.routeSpan, other.routeSpan)
                );
                
                if (overlaps) {
                    group.push(brunnel);
                    foundGroup = true;
                    break;
                }
            }
            
            if (!foundGroup) {
                overlapGroups.push([brunnel]);
            }
        }
        
        // For each overlap group, keep only the closest brunnel to route
        for (const group of overlapGroups) {
            if (group.length > 1) {
                // Mark as overlap group
                for (const brunnel of group) {
                    brunnel.overlapGroup = group;
                }
                
                // Calculate average distance to route for each brunnel
                const brunnelDistances = group.map(brunnel => ({
                    brunnel,
                    avgDistance: this._calculateAverageDistanceToRoute(brunnel, routeCoords)
                }));
                
                // Sort by distance (closest first) 
                brunnelDistances.sort((a, b) => a.avgDistance - b.avgDistance);
                
                // Keep the closest, exclude the rest
                const closestBrunnel = brunnelDistances[0].brunnel;
                console.log(`Overlap group: keeping closest brunnel ${closestBrunnel.id} (avg distance: ${brunnelDistances[0].avgDistance.toFixed(3)}km)`);
                
                for (let i = 1; i < brunnelDistances.length; i++) {
                    const distancePair = brunnelDistances[i];
                    distancePair.brunnel.exclusionReason = 'alternative';
                    console.log(`  Excluding brunnel ${distancePair.brunnel.id} (avg distance: ${distancePair.avgDistance.toFixed(3)}km)`);
                }
            }
        }
    }
    
    /**
     * Calculate average distance from all points in a brunnel to the route
     * @param {Brunnel} brunnel - Brunnel to calculate distance for
     * @param {Array} routeCoords - Route coordinates
     * @returns {number} Average distance in kilometers
     * @private
     */
    static _calculateAverageDistanceToRoute(brunnel, routeCoords) {
        const routeLine = turf.lineString(routeCoords.map(coord => [coord.lon, coord.lat]));
        let totalDistance = 0;
        
        // Calculate distance from each brunnel point to the route
        for (const point of brunnel.geometry) {
            const brunnelPoint = turf.point([point.lon, point.lat]);
            const nearestPoint = turf.nearestPointOnLine(routeLine, brunnelPoint);
            const distance = turf.distance(brunnelPoint, nearestPoint, { units: 'kilometers' });
            totalDistance += distance;
        }
        
        return totalDistance / brunnel.geometry.length;
    }

    /**
     * Check if two route spans overlap
     * @param {Object} span1 - First route span
     * @param {Object} span2 - Second route span
     * @returns {boolean} True if overlapping
     */
    static routeSpansOverlap(span1, span2) {
        return !(span1.endDistance <= span2.startDistance || span2.endDistance <= span1.startDistance);
    }
    
}