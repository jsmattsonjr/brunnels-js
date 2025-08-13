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
        this.routeSpan = null; // Will be set during analysis
        this.exclusionReason = null; // null = included, or reason string
        this.overlapGroup = null; // For handling overlapping brunnels
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
                geometry: bridge.geometry
            }));
        }
        
        // Process tunnels
        for (const tunnel of overpassData.tunnels) {
            brunnels.push(new Brunnel({
                id: tunnel.id,
                type: 'tunnel',
                name: tunnel.name,
                tags: tunnel.tags,
                geometry: tunnel.geometry
            }));
        }
        
        return brunnels;
    }
    
    /**
     * Check if brunnel is contained by route buffer - matches Python is_contained_by()
     * @param {Object} routeBuffer - Buffered route geometry  
     * @returns {boolean} True if contained
     */
    isContainedBy(routeBuffer) {
        const isContained = GeometryUtils.brunnelIsContainedBy(this.geometry, routeBuffer);
        // Debug the problematic bridge
        if (!isContained && this.type === 'bridge') {
            console.log('Bridge excluded from containment:', this.id, this.name);
        }
        return isContained;
    }
    
    /**
     * Calculate route span where this brunnel intersects the route
     * @param {Array} routeCoords - Route coordinates
     * @param {number} bufferMeters - Buffer distance
     */
    calculateRouteSpan(routeCoords, bufferMeters) {
        this.routeSpan = GeometryUtils.calculateRouteSpan(
            this.geometry, 
            routeCoords, 
            bufferMeters
        );
        
        // Debug bridges that fail to get route spans
        if (!this.routeSpan && this.type === 'bridge') {
            console.log('Bridge failed to get route span:', this.id, this.name);
        }
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
        
        return GeometryUtils.isBrunnelAligned(
            this.geometry,
            routeCoords,
            cumulativeDistances,
            this.routeSpan,
            toleranceDegrees
        );
    }
    
    /**
     * Get display name for the brunnel
     * @returns {string} Display name
     */
    getDisplayName() {
        if (this.name && this.name !== this.type) {
            return `${this.type}: ${this.name}`;
        }
        return `${this.type}: <OSM ${this.id}>`;
    }
    
    /**
     * Get route span as string for display
     * @returns {string} Route span description
     */
    getRouteSpanString() {
        if (!this.routeSpan) {
            return 'No span';
        }
        
        const startKm = (this.routeSpan.startDistance / 1000).toFixed(2);
        const endKm = (this.routeSpan.endDistance / 1000).toFixed(2);
        const lengthKm = ((this.routeSpan.endDistance - this.routeSpan.startDistance) / 1000).toFixed(2);
        
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
        if (this.exclusionReason) {
            // Excluded brunnels in muted colors
            return this.type === 'bridge' ? '#ffcccb' : '#e6ccff';
        }
        
        // Included brunnels in bright colors
        return this.type === 'bridge' ? '#e74c3c' : '#9b59b6';
    }
    
    /**
     * Get weight for map display
     * @returns {number} Line weight
     */
    getMapWeight() {
        return this.isIncluded() ? 4 : 2;
    }
    
    /**
     * Get opacity for map display
     * @returns {number} Opacity (0-1)
     */
    getMapOpacity() {
        return this.isIncluded() ? 0.8 : 0.4;
    }
}

/**
 * Brunnel analysis utilities
 */
class BrunnelAnalysis {
    /**
     * Filter brunnels that intersect with route
     * @param {Array} brunnels - Array of Brunnel instances
     * @param {Object} routeBuffer - Buffered route geometry
     */
    static filterContained(brunnels, routeBuffer) {
        return brunnels.filter(brunnel => {
            const isContained = brunnel.isContainedBy(routeBuffer);
            if (!isContained) {
                brunnel.exclusionReason = 'outlier';
            }
            return isContained;
        });
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
     * Filter brunnels by bearing alignment
     * @param {Array} brunnels - Array of Brunnel instances
     * @param {Array} routeCoords - Route coordinates
     * @param {Array} cumulativeDistances - Pre-calculated distances
     * @param {number} toleranceDegrees - Tolerance in degrees
     */
    static filterAligned(brunnels, routeCoords, cumulativeDistances, toleranceDegrees) {
        for (const brunnel of brunnels) {
            if (brunnel.isIncluded() && !brunnel.isAligned(routeCoords, cumulativeDistances, toleranceDegrees)) {
                brunnel.exclusionReason = 'misaligned';
            }
        }
    }
    
    /**
     * Handle overlapping brunnels (simplified version)
     * @param {Array} brunnels - Array of Brunnel instances
     */
    static handleOverlaps(brunnels) {
        const includedBrunnels = brunnels.filter(b => b.isIncluded() && b.routeSpan);
        
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
                
                // Keep only the first one (simplified - could calculate actual distance)
                for (let i = 1; i < group.length; i++) {
                    group[i].exclusionReason = 'alternative';
                }
            }
        }
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
    
    /**
     * Get summary statistics
     * @param {Array} brunnels - Array of Brunnel instances
     * @returns {Object} Summary stats
     */
    static getSummaryStats(brunnels) {
        const bridges = brunnels.filter(b => b.type === 'bridge');
        const tunnels = brunnels.filter(b => b.type === 'tunnel');
        
        // Debug logging
        console.log('Stats calculation:', {
            totalBrunnels: brunnels.length,
            bridges: bridges.length,
            tunnels: tunnels.length,
            bridgeTypes: bridges.map(b => b.type),
            tunnelTypes: tunnels.map(b => b.type),
            allTypes: brunnels.map(b => b.type)
        });
        
        return {
            totalBrunnels: brunnels.length,
            totalBridges: bridges.length,
            totalTunnels: tunnels.length,
            includedBridges: bridges.filter(b => b.isIncluded()).length,
            includedTunnels: tunnels.filter(b => b.isIncluded()).length,
            excludedCount: brunnels.filter(b => !b.isIncluded()).length
        };
    }
}