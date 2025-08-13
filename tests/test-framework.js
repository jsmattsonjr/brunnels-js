/**
 * Lightweight test framework for Brunnels JS
 * Simulates the Python test structure for web environment
 */

class TestRunner {
    constructor() {
        this.tests = new Map();
        this.results = new Map();
    }
    
    addTest(testInstance) {
        this.tests.set(testInstance.constructor.name, testInstance);
    }
    
    async runAllTests() {
        const runBtn = document.getElementById('runAllBtn');
        runBtn.disabled = true;
        runBtn.textContent = 'Running Tests...';
        
        try {
            for (const [name, test] of this.tests) {
                await this.runTest(name);
            }
        } finally {
            runBtn.disabled = false;
            runBtn.textContent = 'Run All Tests';
        }
    }
    
    async runTest(testName) {
        const test = this.tests.get(testName);
        if (!test) {
            console.error(`Test ${testName} not found`);
            return;
        }
        
        this.setTestStatus(testName, 'running');
        this.updateSummary();
        
        try {
            const result = await test.run();
            this.results.set(testName, {
                status: 'pass',
                result: result,
                error: null
            });
            this.setTestStatus(testName, 'pass', result);
        } catch (error) {
            console.error(`Test ${testName} failed:`, error);
            this.results.set(testName, {
                status: 'fail',
                result: null,
                error: error
            });
            this.setTestStatus(testName, 'fail', null, error);
        }
        
        this.updateSummary();
    }
    
    setTestStatus(testName, status, result = null, error = null) {
        const testDiv = document.getElementById(`test-${testName}`);
        if (!testDiv) return;
        
        const statusDiv = testDiv.querySelector('.test-status');
        const resultsDiv = testDiv.querySelector('.results');
        
        statusDiv.className = `test-status ${status}`;
        statusDiv.textContent = status.charAt(0).toUpperCase() + status.slice(1);
        
        if (status === 'pass' && result) {
            resultsDiv.textContent = this.formatTestResult(result);
            resultsDiv.style.display = 'block';
        } else if (status === 'fail' && error) {
            resultsDiv.innerHTML = `<div class="error-details">Error: ${error.message}</div>`;
            resultsDiv.style.display = 'block';
        } else if (status === 'running') {
            resultsDiv.textContent = 'Running test...';
            resultsDiv.style.display = 'block';
        } else {
            resultsDiv.style.display = 'none';
        }
    }
    
    formatTestResult(result) {
        const lines = [];
        lines.push('=== Test Results ===');
        lines.push(`Route: ${result.metadata?.name || 'Unknown'}`);
        lines.push(`Track Points: ${result.route?.coordinates?.length || 'N/A'}`);
        lines.push(`Distance: ${(result.route?.metadata?.totalDistance / 1000).toFixed(2)} km`);
        lines.push('');
        lines.push('=== Brunnels Found ===');
        lines.push(`Total Brunnels: ${result.brunnels?.length || 0}`);
        
        if (result.brunnels && result.brunnels.length > 0) {
            const bridges = result.brunnels.filter(b => b.type === 'bridge');
            const tunnels = result.brunnels.filter(b => b.type === 'tunnel');
            const included = result.brunnels.filter(b => b.isIncluded());
            
            lines.push(`Bridges: ${bridges.length}`);
            lines.push(`Tunnels: ${tunnels.length}`);
            lines.push(`Included: ${included.length}`);
            lines.push('');
            
            if (included.length > 0) {
                lines.push('=== Included Brunnels ===');
                included.forEach(brunnel => {
                    const span = brunnel.routeSpan;
                    const distance = span ? `${(span.startDistance / 1000).toFixed(2)}-${(span.endDistance / 1000).toFixed(2)} km` : 'N/A';
                    lines.push(`${brunnel.type}: ${brunnel.getDisplayName()} (${distance})`);
                });
            }
        }
        
        return lines.join('\\n');
    }
    
    updateSummary() {
        const totalTests = this.tests.size;
        let passed = 0;
        let failed = 0;
        let running = 0;
        
        for (const [name, result] of this.results) {
            if (result.status === 'pass') passed++;
            else if (result.status === 'fail') failed++;
            else if (result.status === 'running') running++;
        }
        
        const summaryStats = document.getElementById('summaryStats');
        summaryStats.innerHTML = `
            <span class="metric"><strong>${totalTests}</strong> Total Tests</span>
            <span class="metric"><strong>${passed}</strong> Passed</span>
            <span class="metric"><strong>${failed}</strong> Failed</span>
            <span class="metric"><strong>${running}</strong> Running</span>
        `;
    }
    
    renderTests() {
        const container = document.getElementById('testResults');
        container.innerHTML = '';
        
        for (const [name, test] of this.tests) {
            const testDiv = document.createElement('div');
            testDiv.className = 'test-section';
            testDiv.id = `test-${name}`;
            
            testDiv.innerHTML = `
                <h3>${test.getDisplayName()}<span class="test-status">Ready</span></h3>
                <p>${test.getDescription()}</p>
                <div class="results" style="display: none;"></div>
            `;
            
            container.appendChild(testDiv);
        }
    }
}

/**
 * Base test class
 */
class BaseTest {
    getDisplayName() {
        return this.constructor.name;
    }
    
    getDescription() {
        return 'Base test class';
    }
    
    async run() {
        throw new Error('Test run() method must be implemented');
    }
    
    // Helper methods for assertions
    assertEqual(actual, expected, message = '') {
        if (actual !== expected) {
            throw new Error(`Assertion failed: ${message}. Expected ${expected}, got ${actual}`);
        }
    }
    
    assertRange(actual, expectedRange, metricName = 'value') {
        if (typeof expectedRange === 'string') {
            if (expectedRange.includes('-')) {
                const [min, max] = expectedRange.split('-').map(Number);
                if (actual < min || actual > max) {
                    throw new Error(`${metricName}: expected ${expectedRange}, got ${actual}`);
                }
            } else if (expectedRange.endsWith('+')) {
                const min = parseInt(expectedRange.slice(0, -1));
                if (actual < min) {
                    throw new Error(`${metricName}: expected ${expectedRange}, got ${actual}`);
                }
            } else {
                const expected = parseInt(expectedRange);
                if (actual !== expected) {
                    throw new Error(`${metricName}: expected ${expected}, got ${actual}`);
                }
            }
        } else {
            if (actual !== expectedRange) {
                throw new Error(`${metricName}: expected ${expectedRange}, got ${actual}`);
            }
        }
    }
    
    assertTrue(condition, message = '') {
        if (!condition) {
            throw new Error(`Assertion failed: ${message}`);
        }
    }
    
    assertFalse(condition, message = '') {
        if (condition) {
            throw new Error(`Assertion failed: ${message}`);
        }
    }
    
    async loadGPXFile(filename) {
        const response = await fetch(`fixtures/${filename}`);
        if (!response.ok) {
            throw new Error(`Failed to load GPX file: ${filename}`);
        }
        return await response.text();
    }
    
    async loadMetadata(filename) {
        const response = await fetch(`fixtures/${filename}`);
        if (!response.ok) {
            throw new Error(`Failed to load metadata file: ${filename}`);
        }
        return await response.json();
    }
    
    async parseGPXContent(gpxContent) {
        const gpx = new gpxParser();
        gpx.parse(gpxContent);
        
        if (gpx.tracks.length === 0) {
            throw new Error('No tracks found in GPX file');
        }
        
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
            }
        };
    }
    
    async runBrunnelsAnalysis(route, options = {}) {
        const defaultOptions = {
            queryBuffer: 10,
            routeBuffer: 3,
            bearingTolerance: 20,
            timeout: 30
        };
        
        const analysisOptions = { ...defaultOptions, ...options };
        
        // Find brunnels using Overpass API
        const expandedBounds = GeometryUtils.expandBounds(route.bounds, analysisOptions.queryBuffer);
        const overpassData = await OverpassAPI.queryBrunnels(expandedBounds, analysisOptions);
        
        // Create brunnel objects
        const brunnels = Brunnel.fromOverpassData(overpassData);
        
        if (brunnels.length === 0) {
            return brunnels;
        }
        
        // Apply filtering pipeline
        const routeBuffer = GeometryUtils.createRouteBuffer(route.coordinates, analysisOptions.routeBuffer);
        
        // Filter contained brunnels
        const containedBrunnels = BrunnelAnalysis.filterContained(brunnels, routeBuffer);
        
        // Calculate route spans
        BrunnelAnalysis.calculateRouteSpans(containedBrunnels, route.coordinates, analysisOptions.routeBuffer);
        
        // Filter by alignment
        if (analysisOptions.bearingTolerance > 0) {
            BrunnelAnalysis.filterAligned(
                containedBrunnels,
                route.coordinates,
                route.cumulativeDistances,
                analysisOptions.bearingTolerance
            );
        }
        
        // Handle overlaps
        BrunnelAnalysis.handleOverlaps(containedBrunnels);
        
        return containedBrunnels;
    }
}