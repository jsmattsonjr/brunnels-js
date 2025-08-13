# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Commands

### Local Development Server
```bash
npm start                   # Start local HTTP server on port 8000
npm run dev                 # Alternative dev command (same as start)
python3 -m http.server 8000 # Direct Python server command
```

The application requires a local server due to browser CORS restrictions for file uploads. Always start the server before testing GPX file analysis.

### Testing the Application
1. Start the server: `npm start`
2. Open `http://localhost:8000` in browser
3. Upload a GPX file and test analysis functionality

### Running Tests
```bash
npm test                    # Start server and show test URL
npm run test:open           # Start server and open test runner (macOS)
```

The test infrastructure includes:
- **Web-based test runner**: `tests/test-runner.html` - Browser-based test execution
- **Test framework**: `tests/test-framework.js` - Lightweight assertion library
- **Chehalis test**: `tests/chehalis-test.js` - Test against known GPX route expectations
- **Test fixtures**: `tests/fixtures/` - GPX files and expected results from Python reference

Tests validate:
- GPX parsing accuracy (track points, distance calculation)
- Overpass API integration (brunnel discovery)
- Filtering pipeline correctness (containment, alignment, overlap handling)
- Known infrastructure detection (specific bridges/tunnels by OSM ID)
- Rails-to-trails route characteristics

## Architecture Overview

This is a **client-side JavaScript port** of a Python brunnels tool that analyzes bridges and tunnels along GPX cycling routes. The architecture mirrors the Python version for maintainability:

### Core Module Structure
- `js/main.js` - Main application controller (equivalent to Python `cli.py`)
- `js/brunnel.js` - Brunnel data structures and analysis logic (equivalent to `brunnel.py`) 
- `js/geometry.js` - Geometric utilities using Turf.js (equivalent to `geometry.py`)
- `js/overpass-api.js` - OpenStreetMap API client (equivalent to `overpass.py`)
- `js/map-visualization.js` - Interactive mapping with Leaflet (equivalent to `visualization.py`)

### Key Dependencies (CDN-loaded)
- **Leaflet** - Interactive mapping (replaces Python's Folium)
- **Turf.js** - Geospatial operations (replaces Python's Shapely)
- **gpxparser** - GPX file parsing (replaces Python's gpxpy)
- **Lodash** - Utilities including binary search (replaces Python's bisect)
- **Proj4js** - Coordinate projections (replaces Python's pyproj)

### Analysis Pipeline
The filtering pipeline matches the Python version exactly:
1. **Query** - Find bridges/tunnels near route using Overpass API
2. **Containment** - Filter brunnels that intersect buffered route geometry
3. **Alignment** - Filter by bearing alignment between brunnel and route
4. **Overlap Resolution** - Handle overlapping brunnels by keeping closest to route

### Data Flow
```
GPX Upload → Route Parsing → Overpass Query → Brunnel Creation → 
Containment Filter → Route Span Calculation → Alignment Filter → 
Overlap Handling → Results Display + Map Visualization
```

## Key Implementation Details

### Brunnel Class (`js/brunnel.js`)
- `Brunnel.fromOverpassData()` - Creates brunnel instances from OSM data
- `calculateRouteSpan()` - Calculates where brunnel intersects route
- `isAligned()` - Checks bearing alignment with route
- Status tracking via `exclusionReason` (null = included)

### Geometry Utils (`js/geometry.js`) 
- Uses Turf.js for all spatial operations
- `createRouteBuffer()` - Buffers route for intersection testing
- `calculateRouteSpan()` - Projects brunnel onto route to find spans
- `isBrunnelAligned()` - Bearing alignment using route substring method

### Overpass API (`js/overpass-api.js`)
- Builds cycling-specific queries (excludes bicycle=no, active railways, waterways)
- Handles timeouts and error responses
- Processes OSM data into standardized brunnel format

### Map Visualization (`js/map-visualization.js`)
- Real-time interactive map updates
- Color-codes included vs excluded brunnels
- Popup details with OSM metadata
- Route start/end markers with distance info

## Development Patterns

### Error Handling
All async operations use try/catch with user-friendly error messages displayed in the UI.

### State Management
The `BrunnelsApp` class maintains application state:
- `this.route` - Current route data with coordinates and metadata
- `this.brunnels` - Array of Brunnel instances with filtering results
- `this.mapVisualization` - Map controller instance

### UI Updates
The application uses a loading state pattern with `showLoading()`, `updateLoadingMessage()`, and result display methods. All DOM updates are centralized in the main app class.

### Filtering Options
User-configurable parameters:
- **Query Buffer** (default 10m) - Search radius around route
- **Route Buffer** (default 3m) - Route containment tolerance  
- **Bearing Tolerance** (default 20°) - Alignment tolerance

The codebase maintains the same filtering algorithms and parameters as the Python version to ensure consistent results.