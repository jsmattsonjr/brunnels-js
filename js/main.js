/**
 * Main application logic for Brunnels JS
 */
class BrunnelsApp {
    constructor() {
        this.route = null;
        this.brunnels = [];
        this.mapVisualization = null;
        this.initializeEventListeners();
    }
    
    /**
     * Initialize event listeners
     */
    initializeEventListeners() {
        const gpxFileInput = document.getElementById('gpxFile');
        const errorBackBtn = document.getElementById('errorBackBtn');
        
        // File selection automatically starts analysis
        gpxFileInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file) {
                this.analyzeRoute();
            }
        });
        
        // Error back button
        errorBackBtn.addEventListener('click', () => {
            this.showUploadScreen();
        });
    }
    
    /**
     * Main analysis function
     */
    async analyzeRoute() {
        try {
            
            // Get file and options
            const gpxFile = document.getElementById('gpxFile').files[0];
            if (!gpxFile) {
                throw new Error('Please select a GPX file');
            }
            
            const options = this.getAnalysisOptions();
            
            // Parse GPX file
            this.showLoading();
            this.updateLoadingMessage('Parsing GPX file...');
            this.route = await this.parseGPXFile(gpxFile);
            
            // Find brunnels
            this.updateLoadingMessage('Querying OpenStreetMap for bridges and tunnels...');
            const overpassData = await this.route.findBrunnels(options);
            
            // Create brunnel objects
            this.brunnels = Brunnel.fromOverpassData(overpassData);
            
            if (this.brunnels.length === 0) {
                this.showResultsScreen();
                this.initializeMap();
                this.mapVisualization.addRoute(this.route.coordinates, this.route.metadata);
                this.updateBrunnelList(); // Show empty list
                this.showMessage('No bridges or tunnels found near your route.');
                return;
            }
            
            // Apply filtering
            this.updateLoadingMessage('Analyzing route intersections...');
            await this.applyFiltering(options);
            
            // Show results
            this.showResultsScreen();
            this.updateBrunnelList();
            this.updateMap();
            
        } catch (error) {
            console.error('Analysis error:', error);
            this.showError(error.message);
        } finally {
            this.hideLoading();
        }
    }
    
    /**
     * Parse GPX file using gpxparser
     */
    async parseGPXFile(file) {
        const text = await file.text();
        // Try different constructor names for gpxparser library
        let gpx;
        if (typeof gpxParser !== 'undefined') {
            gpx = new gpxParser();
        } else if (typeof GPXParser !== 'undefined') {
            gpx = new GPXParser();
        } else {
            throw new Error('GPX parser library not found');
        }
        gpx.parse(text);
        
        if (gpx.tracks.length === 0) {
            throw new Error('No tracks found in GPX file');
        }
        
        // Extract coordinates from first track
        const coordinates = [];
        for (const track of gpx.tracks) {
            for (const point of track.points) {
                coordinates.push({
                    lat: point.lat,
                    lon: point.lon,
                    elevation: point.ele || 0
                });
            }
        }
        
        if (coordinates.length === 0) {
            throw new Error('No coordinates found in GPX tracks');
        }
        
        // Create route object
        const cumulativeDistances = GeometryUtils.calculateCumulativeDistances(coordinates);
        const totalDistance = cumulativeDistances[cumulativeDistances.length - 1];
        const bounds = GeometryUtils.calculateBounds(coordinates);
        
        return {
            coordinates,
            cumulativeDistances,
            bounds,
            metadata: {
                name: gpx.metadata?.name || 'GPX Route',
                totalDistance,
                pointCount: coordinates.length
            },
            async findBrunnels(options) {
                const expandedBounds = GeometryUtils.expandBounds(bounds, options.queryBuffer || 10);
                return await OverpassAPI.queryBrunnels(expandedBounds, options);
            }
        };
    }
    
    /**
     * Get analysis options from form
     */
    getAnalysisOptions() {
        return {
            queryBuffer: parseFloat(document.getElementById('queryBuffer').value) || 10,
            routeBuffer: parseFloat(document.getElementById('routeBuffer').value) || 3,
            bearingTolerance: parseFloat(document.getElementById('bearingTolerance').value) || 20,
            timeout: 30
        };
    }
    
    /**
     * Apply filtering to brunnels
     */
    async applyFiltering(options) {
        // Create route buffer
        this.routeBuffer = GeometryUtils.createRouteBuffer(this.route.coordinates, options.routeBuffer);
        
        // Filter contained brunnels
        this.brunnels = BrunnelAnalysis.filterContained(this.brunnels, this.routeBuffer);
        
        // Calculate route spans
        BrunnelAnalysis.calculateRouteSpans(this.brunnels, this.route.coordinates, options.routeBuffer);
        
        // Filter by alignment
        if (options.bearingTolerance > 0) {
            BrunnelAnalysis.filterAligned(
                this.brunnels, 
                this.route.coordinates, 
                this.route.cumulativeDistances, 
                options.bearingTolerance
            );
        }
        
        // Handle overlaps
        BrunnelAnalysis.handleOverlaps(this.brunnels);
    }
    
    /**
     * Initialize map visualization
     */
    initializeMap() {
        if (!this.mapVisualization) {
            this.mapVisualization = new MapVisualization('map');
        }
        this.mapVisualization.initializeMap(this.route.bounds);
    }
    
    /**
     * Update map with current data
     */
    updateMap() {
        this.initializeMap();
        this.mapVisualization.updateMap(
            this.route.coordinates,
            this.route.metadata,
            this.brunnels
        );
    }
    
    
    /**
     * Update brunnel list
     */
    updateBrunnelList() {
        const listDiv = document.getElementById('brunnelList');
        
        if (this.brunnels.length === 0) {
            listDiv.innerHTML = '<p>No brunnels found near your route.</p>';
            return;
        }
        
        // Sort brunnels by route distance - only show included ones
        const sortedBrunnels = [...this.brunnels]
            .filter(b => b.routeSpan && b.isIncluded())
            .sort((a, b) => a.routeSpan.startDistance - b.routeSpan.startDistance);
        
        const listHTML = sortedBrunnels.map(brunnel => {
            const cssClass = `brunnel-item ${brunnel.type} included`;
            
            return `
                <div class="${cssClass}" data-brunnel-id="${brunnel.id}">
                    <div class="brunnel-name"><strong>${brunnel.getDisplayName()}</strong></div>
                    <div class="brunnel-distance">${brunnel.getRouteSpanString()}</div>
                </div>
            `;
        }).join('');
        
        listDiv.innerHTML = listHTML;
        
        // Add hover event listeners for map highlighting
        this.addBrunnelHoverListeners();
    }
    
    /**
     * Add hover event listeners to brunnel list items
     */
    addBrunnelHoverListeners() {
        const brunnelItems = document.querySelectorAll('.brunnel-item');
        
        brunnelItems.forEach(item => {
            const brunnelId = item.dataset.brunnelId;
            
            item.addEventListener('mouseenter', () => {
                if (this.mapVisualization) {
                    this.mapVisualization.highlightBrunnel(brunnelId, true);
                }
            });
            
            item.addEventListener('mouseleave', () => {
                if (this.mapVisualization) {
                    this.mapVisualization.highlightBrunnel(brunnelId, false);
                }
            });
        });
    }
    
    /**
     * Show upload screen
     */
    showUploadScreen() {
        document.getElementById('uploadScreen').classList.remove('hidden');
        document.getElementById('resultsScreen').classList.add('hidden');
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('error').classList.add('hidden');
    }
    
    /**
     * Show results screen
     */
    showResultsScreen() {
        document.getElementById('uploadScreen').classList.add('hidden');
        document.getElementById('resultsScreen').classList.remove('hidden');
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('error').classList.add('hidden');
    }
    
    /**
     * Show loading overlay
     */
    showLoading() {
        document.getElementById('loading').classList.remove('hidden');
    }
    
    /**
     * Hide loading overlay
     */
    hideLoading() {
        document.getElementById('loading').classList.add('hidden');
    }
    
    /**
     * Update loading message
     */
    updateLoadingMessage(message) {
        const messageP = document.getElementById('loadingMessage');
        if (messageP) {
            messageP.textContent = message;
        }
    }
    
    /**
     * Show error message
     */
    showError(message) {
        const errorDiv = document.getElementById('error');
        const messageP = document.getElementById('errorMessage');
        messageP.textContent = message;
        errorDiv.classList.remove('hidden');
    }
    
    /**
     * Show info message
     */
    showMessage(message) {
        // Could add a message area to the UI
        console.log(message);
    }
}

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new BrunnelsApp();
});