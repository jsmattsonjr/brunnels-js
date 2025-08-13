# Brunnels JS

A web-based JavaScript port of the Python [Brunnels](reference/brunnels) tool for analyzing bridges and tunnels along GPX routes.

## Features

- **Web-based Interface**: Upload and analyze GPX files directly in your browser
- **Real-time Analysis**: Interactive map showing your route with bridges and tunnels
- **Smart Filtering**: Excludes irrelevant infrastructure based on cycling criteria and route alignment
- **Interactive Map**: Click on brunnels for detailed OpenStreetMap metadata
- **Detailed Results**: Summary statistics and comprehensive brunnel list

## Quick Start

1. **Start a local server** (required for file uploads):
   ```bash
   cd brunnels-js
   npm start
   # or: python3 -m http.server 8000
   ```

2. **Open in browser**: Navigate to `http://localhost:8000`

3. **Upload GPX file**: Click "Choose GPX File" and select your route

4. **Analyze**: Click "Analyze Route" to find bridges and tunnels

## Libraries Used

This port uses modern JavaScript libraries equivalent to the Python dependencies:

- **GPX Parsing**: `gpxparser` (equivalent to `gpxpy`)
- **Geospatial Operations**: `@turf/turf` (equivalent to `shapely`)
- **Map Visualization**: `leaflet` (equivalent to `folium`) 
- **Binary Search**: `lodash` (equivalent to Python's `bisect`)
- **Projections**: Handled internally by Turf.js
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

## Development

The code follows the Python version's patterns closely to make maintenance easier:

- Same filtering pipeline (containment → alignment → overlap)
- Same geometric algorithms (using Turf.js instead of Shapely)
- Same data structures and naming conventions
- Equivalent binary search using Lodash

## License

MIT License (same as Python version)
