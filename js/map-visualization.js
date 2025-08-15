/**
 * Map visualization using Leaflet (equivalent to Python's Folium)
 */
class MapVisualization {
    constructor(containerId) {
        this.containerId = containerId;
        this.map = null;
        this.routeLayer = null;
        this.brunnelLayers = [];
        this.brunnelLayerMap = new Map(); // Map brunnel IDs to their Leaflet layers
    }
    
    /**
     * Initialize the map
     * @param {Object} bounds - Map bounds {minLat, maxLat, minLon, maxLon, center}
     */
    initializeMap(bounds) {
        // Create map centered on route
        this.map = L.map(this.containerId).setView(
            [bounds.center.lat, bounds.center.lon], 
            10
        );
        
        // Define base layers
        const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            name: 'Streets'
        });
        
        const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: '© Esri, Maxar, Earthstar Geographics',
            name: 'Satellite'
        });
        
        // Add default layer (streets)
        streetLayer.addTo(this.map);
        
        // Create base layer control
        const baseLayers = {
            'Streets': streetLayer,
            'Satellite': satelliteLayer
        };
        
        // Add layer control to map
        L.control.layers(baseLayers, null, {
            position: 'topright',
            collapsed: true
        }).addTo(this.map);
        
        // Fit map to route bounds
        this.map.fitBounds([
            [bounds.minLat, bounds.minLon],
            [bounds.maxLat, bounds.maxLon]
        ], { padding: [20, 20] });
    }
    
    /**
     * Add route to map
     * @param {Array} routeCoords - Route coordinates
     * @param {Object} metadata - Route metadata
     */
    addRoute(routeCoords, metadata) {
        // Convert to Leaflet format
        const latLngs = routeCoords.map(coord => [coord.lat, coord.lon]);
        
        // Create route polyline
        this.routeLayer = L.polyline(latLngs, {
            color: '#3498db',
            weight: 3,
            opacity: 0.8
        }).addTo(this.map);
        
        // Add start marker
        if (routeCoords.length > 0) {
            const startCoord = routeCoords[0];
            const startIcon = L.icon({
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                shadowSize: [41, 41]
            });
            
            L.marker([startCoord.lat, startCoord.lon], {
                icon: startIcon
            }).addTo(this.map)
              .bindPopup(`<strong>Route Start</strong><br/>Distance: 0.00 km`);
        }
        
        // Add end marker
        if (routeCoords.length > 1) {
            const endCoord = routeCoords[routeCoords.length - 1];
            const endIcon = L.icon({
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                shadowSize: [41, 41]
            });
            
            L.marker([endCoord.lat, endCoord.lon], {
                icon: endIcon
            }).addTo(this.map)
              .bindPopup(`<strong>Route End</strong><br/>Distance: ${(metadata.totalDistance / 1000).toFixed(2)} km`);
        }
    }
    
    /**
     * Add brunnels to map
     * @param {Array} brunnels - Array of Brunnel instances
     */
    addBrunnels(brunnels) {
        // Clear existing brunnel layers
        this.brunnelLayers.forEach(layer => this.map.removeLayer(layer));
        this.brunnelLayers = [];
        this.brunnelLayerMap.clear();
        
        // Filter to only show included brunnels
        const includedBrunnels = brunnels.filter(brunnel => brunnel.isIncluded());
        
        // Add each included brunnel
        for (const brunnel of includedBrunnels) {
            this.addBrunnel(brunnel);
        }
        
        // Add legend (pass all brunnels for stats calculation)
        this.addLegend(brunnels);
    }
    
    /**
     * Add single brunnel to map
     * @param {Brunnel} brunnel - Brunnel instance
     */
    addBrunnel(brunnel) {
        if (brunnel.geometry.length < 2) return;
        
        // Convert to Leaflet format
        const latLngs = brunnel.geometry.map(coord => [coord.lat, coord.lon]);
        
        // Create polyline
        const polyline = L.polyline(latLngs, {
            color: brunnel.getMapColor(),
            weight: brunnel.getMapWeight(),
            opacity: brunnel.getMapOpacity()
        }).addTo(this.map);
        
        // Create popup content
        const popupContent = this.createBrunnelPopup(brunnel);
        polyline.bindPopup(popupContent);
        
        // Store brunnel reference on the layer for style reset
        polyline._brunnel = brunnel;
        
        // Add hover listeners for reverse highlighting (map -> sidebar)
        // Always highlight the representative brunnel in sidebar (since only representatives are shown)
        polyline.on('mouseover', () => {
            const representativeBrunnel = this.getRepresentativeBrunnel(brunnel);
            this.highlightSidebarItem(representativeBrunnel.id, true);
        });
        
        polyline.on('mouseout', () => {
            const representativeBrunnel = this.getRepresentativeBrunnel(brunnel);
            this.highlightSidebarItem(representativeBrunnel.id, false);
        });
        
        this.brunnelLayers.push(polyline);
        this.brunnelLayerMap.set(brunnel.id.toString(), polyline);
    }
    
    /**
     * Create popup content for brunnel
     * @param {Brunnel} brunnel - Brunnel instance
     * @returns {string} HTML content
     */
    createBrunnelPopup(brunnel) {
        let content = `<strong>${brunnel.getDisplayName()}</strong><br/>`;
        content += `Type: ${brunnel.type}<br/>`;
        
        // Show compound brunnel information
        if (brunnel.compoundGroup && brunnel.compoundGroup.length > 1) {
            const segmentIndex = brunnel.compoundGroup.indexOf(brunnel) + 1;
            const totalSegments = brunnel.compoundGroup.length;
            content += `Segment ${segmentIndex} of ${totalSegments} in compound group<br/>`;
        }
        
        if (brunnel.routeSpan) {
            content += `Route span: ${brunnel.getRouteSpanString()}<br/>`;
        }
        
        if (brunnel.exclusionReason) {
            content += `<em>Excluded: ${brunnel.exclusionReason}</em><br/>`;
        }
        
        // Add some OSM tags
        if (brunnel.tags.highway) {
            content += `Highway: ${brunnel.tags.highway}<br/>`;
        }
        if (brunnel.tags.railway) {
            content += `Railway: ${brunnel.tags.railway}<br/>`;
        }
        if (brunnel.tags.waterway) {
            content += `Waterway: ${brunnel.tags.waterway}<br/>`;
        }
        
        content += `<small>OSM ID: ${brunnel.id}</small>`;
        
        return content;
    }
    
    /**
     * Add legend to map
     * @param {Array} brunnels - Array of Brunnel instances
     */
    addLegend(brunnels) {
        const stats = BrunnelAnalysis.getSummaryStats(brunnels);
        
        const legend = L.control({ position: 'bottomright' });
        
        legend.onAdd = function(map) {
            const div = L.DomUtil.create('div', 'legend');
            div.innerHTML = `
                <div style="background: white; padding: 10px; border-radius: 5px; box-shadow: 0 0 10px rgba(0,0,0,0.3);">
                    <h4>Brunnels Legend</h4>
                    <div><span style="color: #3498db; font-weight: bold;">―</span> Route</div>
                    <div><span style="color: #e74c3c; font-weight: bold;">―</span> Bridges (${stats.includedBridges})</div>
                    <div><span style="color: #9b59b6; font-weight: bold;">―</span> Tunnels (${stats.includedTunnels})</div>
                </div>
            `;
            return div;
        };
        
        legend.addTo(this.map);
    }
    
    /**
     * Create custom icon for markers
     * @param {string} emoji - Emoji character
     * @param {string} color - Background color
     * @returns {Object} Leaflet icon
     */
    createCustomIcon(emoji, color) {
        return L.divIcon({
            html: `<div style="background: ${color}; border-radius: 50%; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; font-size: 16px; border: 2px solid white;">${emoji}</div>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15],
            popupAnchor: [0, -15],
            className: 'custom-marker'
        });
    }
    
    /**
     * Update map with new data
     * @param {Array} routeCoords - Route coordinates
     * @param {Object} routeMetadata - Route metadata
     * @param {Array} brunnels - Array of Brunnel instances
     */
    updateMap(routeCoords, routeMetadata, brunnels) {
        // Clear existing layers
        if (this.routeLayer) {
            this.map.removeLayer(this.routeLayer);
        }
        this.brunnelLayers.forEach(layer => this.map.removeLayer(layer));
        this.brunnelLayers = [];
        
        // Add route and brunnels
        this.addRoute(routeCoords, routeMetadata);
        this.addBrunnels(brunnels);
        
        // Fit bounds to new data
        const bounds = GeometryUtils.calculateBounds(routeCoords);
        this.map.fitBounds([
            [bounds.minLat, bounds.minLon],
            [bounds.maxLat, bounds.maxLon]
        ], { padding: [20, 20] });
    }
    
    /**
     * Highlight a brunnel on the map - highlights all segments in compound groups
     * @param {string} brunnelId - ID of the brunnel to highlight
     * @param {boolean} highlight - Whether to highlight (true) or unhighlight (false)
     */
    highlightBrunnel(brunnelId, highlight) {
        const brunnel = this.findBrunnelById(brunnelId);
        if (!brunnel) return;
        
        // Get all brunnels to highlight (compound group or just the single brunnel)
        const brunnelsToHighlight = brunnel.compoundGroup && brunnel.compoundGroup.length > 1 
            ? brunnel.compoundGroup 
            : [brunnel];
        
        // Highlight/unhighlight all segments
        for (const targetBrunnel of brunnelsToHighlight) {
            const layer = this.brunnelLayerMap.get(targetBrunnel.id.toString());
            if (layer) {
                if (highlight) {
                    layer.setStyle({
                        weight: 8,
                        opacity: 1.0,
                        color: '#ffff00' // Bright yellow for highlight
                    });
                    layer.bringToFront();
                } else {
                    // Reset to original style
                    layer.setStyle({
                        color: targetBrunnel.getMapColor(),
                        weight: brunnel.getMapWeight(),
                        opacity: brunnel.getMapOpacity()
                    });
                }
            }
        }
    }
    
    /**
     * Get the representative brunnel for a given brunnel (for sidebar highlighting)
     * @param {Brunnel} brunnel - Brunnel instance
     * @returns {Brunnel} Representative brunnel (either itself or compound group representative)
     */
    getRepresentativeBrunnel(brunnel) {
        if (!brunnel.compoundGroup || brunnel.compoundGroup.length <= 1) {
            return brunnel;
        }
        // Find the representative in the compound group
        return brunnel.compoundGroup.find(b => b.isRepresentative()) || brunnel;
    }

    /**
     * Highlight a brunnel item in the sidebar
     * @param {string} brunnelId - ID of the brunnel to highlight
     * @param {boolean} highlight - Whether to highlight (true) or unhighlight (false)
     */
    highlightSidebarItem(brunnelId, highlight) {
        const sidebarItem = document.querySelector(`[data-brunnel-id="${brunnelId}"]`);
        if (sidebarItem) {
            if (highlight) {
                sidebarItem.style.background = '#f0f0f0';
                sidebarItem.style.transform = 'translateX(2px)';
            } else {
                sidebarItem.style.background = '';
                sidebarItem.style.transform = '';
            }
        }
    }
    
    /**
     * Set brunnel visibility on map
     * @param {string} brunnelId - ID of the brunnel to show/hide
     * @param {boolean} visible - Whether to show (true) or hide (false) the brunnel
     */
    setBrunnelVisibility(brunnelId, visible) {
        const layer = this.brunnelLayerMap.get(brunnelId.toString());
        if (layer) {
            if (visible) {
                // Add layer back to map if it's not already there
                if (!this.map.hasLayer(layer)) {
                    this.map.addLayer(layer);
                }
            } else {
                // Remove layer from map
                if (this.map.hasLayer(layer)) {
                    this.map.removeLayer(layer);
                }
            }
        }
    }
    
    /**
     * Find brunnel by ID (helper method)
     * @param {string} brunnelId - ID to search for
     * @returns {Brunnel|null} Found brunnel or null
     */
    findBrunnelById(brunnelId) {
        const layer = this.brunnelLayerMap.get(brunnelId.toString());
        return layer ? layer._brunnel : null;
    }
}