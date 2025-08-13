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
        const analyzeBtn = document.getElementById('analyzeBtn');
        
        gpxFileInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file) {
                analyzeBtn.disabled = false;
                analyzeBtn.textContent = 'Analyze Route';
            } else {
                analyzeBtn.disabled = true;
                analyzeBtn.textContent = 'Choose GPX File';
            }
        });
        
        analyzeBtn.addEventListener('click', () => {
            this.analyzeRoute();
        });
    }
    
    /**
     * Main analysis function
     */
    async analyzeRoute() {
        try {
            this.showLoading(true);
            this.hideError();
            this.hideResults();
            
            // Get file and options
            const gpxFile = document.getElementById('gpxFile').files[0];
            if (!gpxFile) {
                throw new Error('Please select a GPX file');
            }
            
            const options = this.getAnalysisOptions();
            
            // Parse GPX file
            this.updateLoadingMessage('Parsing GPX file...');
            this.route = await this.parseGPXFile(gpxFile);
            
            // Find brunnels
            this.updateLoadingMessage('Querying OpenStreetMap for bridges and tunnels...');
            const overpassData = await this.route.findBrunnels(options);
            
            // Create brunnel objects
            this.brunnels = Brunnel.fromOverpassData(overpassData);
            
            if (this.brunnels.length === 0) {
                this.showResults();
                this.updateSummary({ 
                    totalBrunnels: 0, 
                    totalBridges: 0, 
                    totalTunnels: 0,
                    includedBridges: 0,
                    includedTunnels: 0,
                    excludedCount: 0 
                });
                this.initializeMap();
                this.mapVisualization.addRoute(this.route.coordinates, this.route.metadata);
                this.showMessage('No bridges or tunnels found near your route.');
                return;
            }
            
            // Apply filtering
            this.updateLoadingMessage('Analyzing route intersections...');
            await this.applyFiltering(options);
            
            // Show results
            this.showResults();
            this.updateSummary(BrunnelAnalysis.getSummaryStats(this.brunnels));
            this.updateBrunnelList();
            this.updateMap();
            
        } catch (error) {
            console.error('Analysis error:', error);
            this.showError(error.message);
        } finally {
            this.showLoading(false);
        }
    }
    
    /**
     * Parse GPX file using gpxparser
     */
    async parseGPXFile(file) {
        const text = await file.text();
        const gpx = new gpxParser();
        gpx.parse(text);
        
        if (gpx.tracks.length === 0) {
            throw new Error('No tracks found in GPX file');
        }
        
        // Extract coordinates from first track
        const coordinates = [];
        for (const track of gpx.tracks) {
            for (const segment of track.points) {
                for (const point of segment) {
                    coordinates.push({
                        lat: point.lat,
                        lon: point.lon,
                        elevation: point.ele || 0
                    });
                }
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
        const routeBuffer = GeometryUtils.createRouteBuffer(this.route.coordinates, options.routeBuffer);
        
        // Filter contained brunnels
        this.brunnels = BrunnelAnalysis.filterContained(this.brunnels, routeBuffer);
        
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
            this.mapVisualization.initializeMap(this.route.bounds);
        }
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
     * Update summary statistics
     */
    updateSummary(stats) {
        const summaryDiv = document.getElementById('summaryStats');
        summaryDiv.innerHTML = `
            <div class="summary-stats">
                <div class="stat-item">
                    <div class="stat-value">${stats.totalBrunnels}</div>
                    <div class="stat-label">Total Found</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${stats.includedBridges}</div>
                    <div class="stat-label">Bridges</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${stats.includedTunnels}</div>
                    <div class="stat-label">Tunnels</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${stats.excludedCount}</div>
                    <div class="stat-label">Excluded</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${(this.route.metadata.totalDistance / 1000).toFixed(1)} km</div>
                    <div class="stat-label">Route Distance</div>
                </div>
            </div>
        `;
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
        
        // Sort brunnels by route distance
        const sortedBrunnels = [...this.brunnels]
            .filter(b => b.routeSpan)
            .sort((a, b) => a.routeSpan.startDistance - b.routeSpan.startDistance);
        
        const listHTML = sortedBrunnels.map(brunnel => {
            const cssClass = `brunnel-item ${brunnel.type} ${brunnel.isIncluded() ? 'included' : 'excluded'}`;
            const status = brunnel.isIncluded() ? '*' : '-';
            
            return `
                <div class="${cssClass}">
                    <div class="brunnel-distance">${brunnel.getRouteSpanString()} ${status}</div>
                    <div class="brunnel-name">${brunnel.getDisplayName()}</div>
                    <div class="brunnel-details">
                        ${brunnel.exclusionReason ? `Excluded: ${brunnel.exclusionReason}` : 'Included'}
                    </div>
                </div>
            `;
        }).join('');
        
        listDiv.innerHTML = listHTML;
    }
    
    /**
     * Show/hide loading state
     */
    showLoading(show) {
        const loadingDiv = document.getElementById('loading');
        loadingDiv.classList.toggle('hidden', !show);
    }
    
    /**
     * Update loading message
     */
    updateLoadingMessage(message) {
        const loadingDiv = document.getElementById('loading');
        const messageP = loadingDiv.querySelector('p');
        if (messageP) {
            messageP.textContent = message;
        }
    }
    
    /**
     * Show/hide results
     */
    showResults() {
        const resultsDiv = document.getElementById('results');
        resultsDiv.classList.remove('hidden');
    }
    
    hideResults() {
        const resultsDiv = document.getElementById('results');
        resultsDiv.classList.add('hidden');
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
     * Hide error message
     */
    hideError() {
        const errorDiv = document.getElementById('error');
        errorDiv.classList.add('hidden');
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