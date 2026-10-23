const rawData = window.rawData;
const zoneInfo = document.getElementById('zone-info');

const formatMetric = (value, digits) => (
    value === null ? 'N/A' : value.toFixed(digits)
);

function getZoneStatus(score) {
    if (score < 1.5) return { label: 'Healthy', color: '#19c7a3' };
    if (score < 2.5) return { label: 'At risk', color: '#f5b942' };
    return { label: 'Severely affected', color: '#f06464' };
}

function renderZoneInfo(properties) {
    const status = getZoneStatus(properties.meanScore);
    zoneInfo.innerHTML = `
        <div class="zone-status" style="--status-color: ${status.color}">
            <span class="status-dot"></span>${status.label}
        </div>
        <div class="metrics">
            <div class="metric-card">
                <span class="metrics-title">Average health score</span>
                <strong class="metrics-value">${properties.meanScore.toFixed(2)}</strong>
            </div>
            <div class="metric-card">
                <span class="metrics-title">Water temperature</span>
                <strong class="metrics-value">${formatMetric(properties.meanTemp, 1)}<small>°C</small></strong>
            </div>
            <div class="metric-card">
                <span class="metrics-title">Light level</span>
                <strong class="metrics-value">${formatMetric(properties.meanLumen, 0)}<small> lm</small></strong>
            </div>
            <p class="data-count">Based on ${properties.dataCount} sensor reading${properties.dataCount === 1 ? '' : 's'}</p>
        </div>`;
}

if (!rawData || rawData.type !== 'FeatureCollection' || !rawData.features?.length) {
    zoneInfo.innerHTML = '<p class="empty-state">No sensor readings are available. Add point features to the GeoJSON dataset to populate the map.</p>';
    console.error('Provide window.rawData as a GeoJSON FeatureCollection containing point features.');
} else {
    const pointFeatures = rawData.features.filter((feature) => feature.geometry?.type === 'Point');

    if (!pointFeatures.length) {
        zoneInfo.innerHTML = '<p class="empty-state">The dataset does not contain any point readings.</p>';
        console.error('The GeoJSON FeatureCollection must contain at least one Point feature.');
    } else {
        const points = turf.featureCollection(pointFeatures);
        const hexGrid = turf.hexGrid(turf.bbox(points), 1, { units: 'kilometers' });

        hexGrid.features.forEach((hex) => {
            const readings = turf.pointsWithinPolygon(points, hex).features;
            const average = (property) => {
                const values = readings
                    .map((point) => point.properties?.[property])
                    .filter((value) => typeof value === 'number' && Number.isFinite(value));

                return values.length
                    ? values.reduce((total, value) => total + value, 0) / values.length
                    : null;
            };

            hex.properties.meanScore = average('score');
            hex.properties.meanTemp = average('temperature');
            hex.properties.meanLumen = average('lumen');
            hex.properties.dataCount = readings.length;
        });

        L.geoJSON(hexGrid, {
            style: (feature) => {
                const score = feature.properties.meanScore;
                return {
                    fillColor: score === null ? '#65727d' : getZoneStatus(score).color,
                    color: '#d8e5e9',
                    weight: 0.7,
                    fillOpacity: score === null ? 0.08 : 0.72
                };
            },
            onEachFeature: (feature, layer) => {
                const properties = feature.properties;
                if (properties.meanScore === null) return;

                layer.bindPopup(
                    `<strong>${getZoneStatus(properties.meanScore).label}</strong><br>` +
                    `Avg health: ${properties.meanScore.toFixed(2)}<br>` +
                    `Avg temperature: ${formatMetric(properties.meanTemp, 1)} °C<br>` +
                    `Avg light: ${formatMetric(properties.meanLumen, 0)} lm<br>` +
                    `Sensor readings: ${properties.dataCount}`
                );
                layer.on('click', () => renderZoneInfo(properties));
            }
        }).addTo(map);
    }
}