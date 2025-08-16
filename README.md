# Brunnels JS

A web-based JavaScript port of the Python [Brunnels](reference/brunnels) tool for analyzing bridges and tunnels along GPX routes.

## Features

- **Web-based Interface**: Upload and analyze GPX files directly in your browser
- **Real-time Analysis**: Interactive map showing your route with bridges and tunnels
- **Smart Filtering**: Excludes irrelevant infrastructure based on cycling criteria and route alignment
- **Interactive Map**: Click on brunnels for detailed OpenStreetMap metadata
- **Caching Proxy**: Local Overpass API cache to avoid rate limits and improve performance
- **Performance Optimizations**: Efficient intersection testing and route chunking for long routes
- **Advanced Options**: Configurable search and filtering parameters
- **Compound Brunnel Detection**: Identifies and visualizes complex bridge/tunnel structures
- **Detailed Results**: Summary statistics and comprehensive brunnel list with distance reporting

## Quick Start

1. **Start the development environment** (recommended):
   ```bash
   cd brunnels-js
   npm run dev:full
   ```
   This starts both the web server (port 8000) and the Overpass API caching proxy (port 3001).

2. **Alternative - Basic server only**:
   ```bash
   npm start
   # or: python3 -m http.server 8000
   ```

3. **Open in browser**: Navigate to `http://localhost:8000`

4. **Upload GPX file**: Click "Choose GPX File" and select your route

5. **Configure options** (optional): Click the gear icon to adjust search parameters

6. **Analyze**: Click "Analyze Route" to find bridges and tunnels

## Libraries Used

This port uses modern JavaScript libraries equivalent to the Python dependencies:

- **GPX Parsing**: `gpxparser` (equivalent to `gpxpy`)
- **Geospatial Operations**: `@turf/turf` (equivalent to `shapely`)
- **Map Visualization**: `leaflet` (equivalent to `folium`) 
- **Binary Search**: `lodash` (equivalent to Python's `bisect`)
- **Coordinate Projections**: Handled internally by Turf.js
- **HTTP Requests**: `fetch` (equivalent to `requests`)

## Options

- **Search Buffer**: Distance in meters to search around your route (default: 10m)
- **Route Buffer**: Buffer for containment analysis (default: 3m)  
- **Bearing Tolerance**: Alignment tolerance in degrees (default: 20°)

## Architecture

The JavaScript port closely mirrors the Python version's architecture:

- `js/geometry.js` - Geometric utilities using Turf.js (equivalent to `geometry.py`)
- `js/overpass-api.js` - OpenStreetMap API client (equivalent to `overpass.py`)
- `js/brunnel.js` - Brunnel data structures and analysis (equivalent to `brunnel.py`)
- `js/map-visualization.js` - Interactive mapping (equivalent to `visualization.py`)
- `js/main.js` - Main application logic (equivalent to `cli.py`)

## Key Differences from Python Version

1. **Web Interface**: Browser-based instead of command-line
2. **Real-time**: Interactive analysis vs. batch processing
3. **Client-side**: All processing happens in the browser

## Browser Compatibility

Requires a modern browser with support for:
- ES6+ JavaScript features
- Fetch API
- File API for GPX uploads

## Performance Features

- **Caching Proxy Server**: Automatically caches Overpass API responses for 24 hours to avoid rate limits
- **Optimized Intersection Testing**: Efficient point-in-polygon checking before expensive intersection operations
- **Route Chunking**: Handles long routes by breaking them into manageable segments
- **Smart Overlap Resolution**: Selects the closest brunnel to the route when multiple brunnels overlap

## Development

The code follows the Python version's patterns closely to make maintenance easier:

- Same filtering pipeline (containment → alignment → overlap)
- Same geometric algorithms (using Turf.js instead of Shapely)
- Same data structures and naming conventions
- Equivalent binary search using Lodash

## License

MIT License (same as Python version)
