/**
 * Chehalis Western Trail test
 * Tests the JavaScript implementation against known expectations
 */
class ChehalisTest extends BaseTest {
    getDisplayName() {
        return 'Chehalis Western Trail Test';
    }
    
    getDescription() {
        return 'Rails-to-trails route in Washington State featuring highway=cycleway bridges with railway=razed tags';
    }
    
    async run() {
        // Load test data
        const gpxContent = await this.loadGPXFile('Chehalis.gpx');
        const metadata = await this.loadMetadata('Chehalis.json');
        
        // Parse GPX file
        const route = await this.parseGPXContent(gpxContent);
        
        // Validate basic route properties
        this.assertEqual(route.coordinates.length, metadata.track_points, 'Track points count');
        this.assertTrue(
            Math.abs(route.metadata.totalDistance / 1000 - metadata.distance_km) < 0.1,
            `Route distance should be ~${metadata.distance_km} km, got ${(route.metadata.totalDistance / 1000).toFixed(2)} km`
        );
        
        // Run brunnels analysis
        const brunnels = await this.runBrunnelsAnalysis(route);
        
        // Validate results against expectations
        const expected = metadata.expected_results;
        
        // Count brunnels by type and status
        const totalBrunnels = brunnels.length;
        const bridges = brunnels.filter(b => b.type === 'bridge');
        const tunnels = brunnels.filter(b => b.type === 'tunnel');
        const includedBrunnels = brunnels.filter(b => b.isIncluded());
        const includedBridges = includedBrunnels.filter(b => b.type === 'bridge');
        const includedTunnels = includedBrunnels.filter(b => b.type === 'tunnel');
        
        // Check if we have the expected brunnels
        this.assertRange(includedBridges.length, expected.nearby_bridges, 'nearby bridges');
        this.assertRange(includedTunnels.length, expected.nearby_tunnels, 'nearby tunnels');
        this.assertRange(includedBrunnels.length, expected.final_included_total, 'final included total');
        
        // Validate known bridges and tunnels are present
        await this.validateKnownInfrastructure(includedBrunnels, metadata);
        
        // Validate rails-to-trails characteristics
        this.validateRailsToTrailsCharacteristics(includedBrunnels, metadata);
        
        return {
            route: route,
            brunnels: brunnels,
            metadata: metadata,
            analysis: {
                totalBrunnels: totalBrunnels,
                bridges: bridges.length,
                tunnels: tunnels.length,
                includedTotal: includedBrunnels.length,
                includedBridges: includedBridges.length,
                includedTunnels: includedTunnels.length
            }
        };
    }
    
    async validateKnownInfrastructure(includedBrunnels, metadata) {
        // Check known bridges
        for (const expectedBridge of metadata.known_bridges) {
            const found = includedBrunnels.some(brunnel => 
                brunnel.type === 'bridge' && 
                (brunnel.name === expectedBridge.name || brunnel.id == expectedBridge.osm_way_id)
            );
            this.assertTrue(found, `Known bridge ${expectedBridge.name} (OSM ${expectedBridge.osm_way_id}) should be found`);
        }
        
        // Check known tunnels
        for (const expectedTunnel of metadata.known_tunnels) {
            const found = includedBrunnels.some(brunnel => 
                brunnel.type === 'tunnel' && 
                (brunnel.name === expectedTunnel.name || brunnel.id == expectedTunnel.osm_way_id)
            );
            this.assertTrue(found, `Known tunnel ${expectedTunnel.name} (OSM ${expectedTunnel.osm_way_id}) should be found`);
        }
    }
    
    validateRailsToTrailsCharacteristics(includedBrunnels, metadata) {
        // All included brunnels should have the same name (Chehalis Western Trail)
        const trailNameCount = includedBrunnels.filter(b => 
            b.name && b.name.includes('Chehalis Western Trail')
        ).length;
        
        this.assertTrue(
            trailNameCount === includedBrunnels.length,
            'All brunnels should be part of Chehalis Western Trail'
        );
        
        // Should have good mix of bridges and tunnels
        const bridgeCount = includedBrunnels.filter(b => b.type === 'bridge').length;
        const tunnelCount = includedBrunnels.filter(b => b.type === 'tunnel').length;
        
        this.assertEqual(bridgeCount, 5, 'Should have 5 bridges');
        this.assertEqual(tunnelCount, 1, 'Should have 1 tunnel');
        
        // All brunnels should be individual (no compound brunnels expected on this route)
        const individualCount = includedBrunnels.length; // All should be individual
        this.assertEqual(
            individualCount, 
            includedBrunnels.length, 
            'All brunnels should be individual (no compound expected)'
        );
    }
}