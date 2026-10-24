const zoneInfo = document.getElementById('zone-info');
const map = L.map('map', { zoomControl: false }).setView([-8.635, 115.235], 11);
const streetMap = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19
});
const oceanBasemap = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Esri, Garmin, GEBCO, NOAA NGDC, and other contributors',
    maxZoom: 16
});
const communityReports = L.layerGroup().addTo(map);
const reportStorageKey = 'coraleye-community-reports-v1';
let currentLandMask = null;

L.control.zoom({ position: 'bottomright' }).addTo(map);
L.control.layers({
    'OpenStreetMap': streetMap,
    'Ocean basemap': oceanBasemap
}).addTo(map);
streetMap.addTo(map);

function showMessage(message) {
    zoneInfo.innerHTML = `<p class="empty-state">${message}</p>`;
}

const formatMetric = (value, digits) => (
    value === null ? 'N/A' : value.toFixed(digits)
);

function getZoneStatus(score) {
    if (score < 1.5) return { label: 'Healthy', color: '#19c7a3' };
    if (score < 2.5) return { label: 'At risk', color: '#f5b942' };
    return { label: 'Severely affected', color: '#f06464' };
}

function addCommunityMarker(report, focus = false) {
    const marker = L.circleMarker([report.latitude, report.longitude], {
        radius: 7,
        color: '#f3fbf9',
        weight: 1.5,
        fillColor: getZoneStatus(report.score).color,
        fillOpacity: 1
    }).addTo(communityReports);

    marker.bindPopup(
        '<strong>Community report</strong><br>' +
        `Health: ${report.score.toFixed(1)}<br>` +
        `Temperature: ${formatMetric(report.temperature, 1)} °C<br>` +
        `Light: ${formatMetric(report.lumen, 0)} lux`
    );
    marker.on('click', () => renderZoneInfo({
        meanScore: report.score,
        meanTemp: report.temperature,
        meanLumen: report.lumen,
        dataCount: 1
    }));
    if (focus) map.panTo([report.latitude, report.longitude]);
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

function renderReadings(rawData, landMask) {
    if (!rawData.features.length) {
        showMessage('No valid sensor readings were found in data.csv.');
        return;
    }

    const pointFeatures = rawData.features.filter((feature) => feature.geometry?.type === 'Point');

    if (!pointFeatures.length) {
        showMessage('The CSV does not contain any valid location readings.');
    } else {
        const waterReadings = pointFeatures.filter((point) => (
            !turf.booleanPointInPolygon(point, landMask)
        ));

        waterReadings.forEach((point) => {
            const properties = point.properties;
            const marker = L.circleMarker(
                [point.geometry.coordinates[1], point.geometry.coordinates[0]],
                {
                    radius: 6,
                    color: '#f3fbf9',
                    weight: 1.5,
                    fillColor: getZoneStatus(properties.score).color,
                    fillOpacity: 0.95
                }
            ).addTo(map);

            marker.bindPopup(
                '<strong>Offshore reading</strong><br>' +
                `Health: ${properties.score.toFixed(2)}<br>` +
                `Temperature: ${formatMetric(properties.temperature, 1)} °C<br>` +
                `Light: ${formatMetric(properties.lumen, 0)} lm`
            );
            marker.on('click', () => renderZoneInfo({
                meanScore: properties.score,
                meanTemp: properties.temperature,
                meanLumen: properties.lumen,
                dataCount: 1
            }));
        });

        if (!waterReadings.length) {
            showMessage('No offshore readings found. Land readings are hidden; move sensor coordinates out to sea to display markers.');
            return;
        }

        const points = turf.featureCollection(waterReadings);
        const [minLongitude, minLatitude, maxLongitude, maxLatitude] = turf.bbox(points);
        const padding = 0.02;
        const hexGrid = turf.hexGrid([
            minLongitude - padding,
            minLatitude - padding,
            maxLongitude + padding,
            maxLatitude + padding
        ], 1, { units: 'kilometers' });

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

        const waterHexes = hexGrid.features.filter((hex) => (
            hex.properties.dataCount > 0 && !turf.booleanIntersects(hex, landMask)
        ));

        if (!waterHexes.length) {
            showMessage(`Showing ${waterReadings.length} offshore readings as markers. No full 1 km water-only cells were found; move readings farther from shore to generate zones.`);
            return;
        }

        showMessage(`Showing ${waterReadings.length} offshore readings as markers. Select a colored water zone for its average.`);
        L.geoJSON(turf.featureCollection(waterHexes), {
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

function toNumber(value) {
    if (value === undefined || value === null || String(value).trim() === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

async function loadBaliLandMask() {
    const cacheKey = 'coraleye-bali-land-mask-v1';
    let landMask;

    try {
        const cachedMask = localStorage.getItem(cacheKey);
        if (cachedMask) landMask = JSON.parse(cachedMask);
    } catch {
        landMask = null;
    }

    if (landMask?.geometry) return landMask;

    const url = 'https://nominatim.openstreetmap.org/search.php?q=Bali%20Island%2C%20Indonesia&polygon_geojson=1&format=jsonv2&limit=1';
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Coastline request failed with status ${response.status}.`);

    const [island] = await response.json();
    if (!island?.geojson) throw new Error('The Bali coastline was not returned.');

    landMask = turf.feature(island.geojson);
    try {
        localStorage.setItem(cacheKey, JSON.stringify(landMask));
    } catch {
        // Continue without caching when browser storage is unavailable.
    }

    return landMask;
}

function restoreCommunityReports(landMask) {
    let reports = [];
    try {
        const savedReports = JSON.parse(localStorage.getItem(reportStorageKey) || '[]');
        if (Array.isArray(savedReports)) reports = savedReports;
    } catch {
        reports = [];
    }

    reports.forEach((report) => {
        const values = [report.latitude, report.longitude, report.score];
        if (!values.every(Number.isFinite)) return;

        const point = turf.point([report.longitude, report.latitude]);
        if (!turf.booleanPointInPolygon(point, landMask)) addCommunityMarker(report);
    });
}

const contributionForm = document.getElementById('contribution-form');
const photoInput = document.getElementById('coralImage');
const photoPreview = document.getElementById('image-preview');
const contributionStatus = document.getElementById('contribution-status');
let photoPreviewUrl = null;

photoInput.addEventListener('change', () => {
    const [photo] = photoInput.files;
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    photoPreviewUrl = null;

    if (!photo) {
        photoPreview.hidden = true;
        photoPreview.removeAttribute('src');
        return;
    }

    photoPreviewUrl = URL.createObjectURL(photo);
    photoPreview.src = photoPreviewUrl;
    photoPreview.hidden = false;
});

contributionForm.addEventListener('submit', (event) => {
    event.preventDefault();
    contributionStatus.classList.remove('is-success');

    if (!currentLandMask) {
        contributionStatus.textContent = 'The coastline is still loading. Try again in a moment.';
        return;
    }

    const formData = new FormData(contributionForm);
    const report = {
        latitude: Number(formData.get('latitude')),
        longitude: Number(formData.get('longitude')),
        score: Number(formData.get('score')),
        temperature: Number(formData.get('temperature')),
        lumen: Number(formData.get('lumen'))
    };
    const point = turf.point([report.longitude, report.latitude]);

    if (turf.booleanPointInPolygon(point, currentLandMask)) {
        contributionStatus.textContent = 'That location is on land. Choose an offshore location to add a sea marker.';
        return;
    }

    try {
        const reports = JSON.parse(localStorage.getItem(reportStorageKey) || '[]');
        reports.push(report);
        localStorage.setItem(reportStorageKey, JSON.stringify(reports));
    } catch {
        contributionStatus.textContent = 'Could not save this report in browser storage.';
        return;
    }

    addCommunityMarker(report, true);
    if (draftMarker) {
        map.removeLayer(draftMarker);
        draftMarker = null;
    }
    contributionForm.reset();
    photoPreview.hidden = true;
    photoPreview.removeAttribute('src');
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    photoPreviewUrl = null;
    contributionStatus.textContent = 'Report saved in this browser and added to the map. The photo was previewed only.';
    contributionStatus.classList.add('is-success');
});

Papa.parse('data.csv', {
    download: true,
    header: true,
    skipEmptyLines: 'greedy',
    complete: async (results) => {
        const features = results.data.flatMap((row) => {
            const latitude = toNumber(row.latitude);
            const longitude = toNumber(row.longitude);
            const score = toNumber(row.score);

            if (latitude === null || longitude === null || score === null) return [];

            return [{
                type: 'Feature',
                properties: {
                    score,
                    temperature: toNumber(row.temperature),
                    lumen: toNumber(row.lumen)
                },
                geometry: {
                    type: 'Point',
                    coordinates: [longitude, latitude]
                }
            }];
        });

        try {
            const landMask = await loadBaliLandMask();
            currentLandMask = landMask;
            restoreCommunityReports(landMask);
            renderReadings({ type: 'FeatureCollection', features }, landMask);
        } catch (error) {
            console.error('Could not load the Bali land mask:', error);
            showMessage('Could not load the Bali coastline mask. Check your internet connection and reload the page.');
        }
    },
    error: (error) => {
        console.error('Could not load data.csv:', error);
        showMessage('Could not load data.csv. Serve the project over HTTP and check that the CSV file is present.');
    }
});

let draftMarker = null;
map.on('click', (event) => {
    const { lat, lng } = event.latlng;

    if (!currentLandMask) {
        contributionStatus.textContent = 'The coastline is still loading. Try selecting a location again in a moment.';
        return;
    }

    const point = turf.point([lng, lat]);
    if (turf.booleanPointInPolygon(point, currentLandMask)) {
        if (draftMarker) map.removeLayer(draftMarker);
        draftMarker = null;
        contributionStatus.textContent = 'That location is on land. Choose a point offshore.';
        return;
    }

    document.getElementById('latitude').value = lat.toFixed(5);
    document.getElementById('longitude').value = lng.toFixed(5);
    if (draftMarker) map.removeLayer(draftMarker);

    draftMarker = L.marker([lat, lng], {
        icon: L.divIcon({
            className: 'draft-pin',
            html: '<span></span>',
            iconSize: [16, 16],
            iconAnchor: [8, 8]
        }),
        keyboard: false,
        interactive: false
    }).addTo(map);
    contributionStatus.textContent = 'Offshore location selected. Complete the remaining fields to add your report.';
});

let coralModel =null;
tflite.loadTFLiteModel('model.tflite').then((model) => {
    coralModel = model;
    document.getElementById('contribution-status').textContent = 'Coral health model loaded. You can now upload a photo to get a health score.';
}).

contributionForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    contributionStatus.classList.remove('is-success');
    if (!currentLandMask){
        contributionStatus.textContent = 'The coastline is still loading. Try again in a moment.';
        return;
    }
    if (!coralModel || !photoInput.files.length) {
        contributionStatus.textContent = 'Please upload a photo to get a health score.';
        return;
    }
    
    const tensor = tf.browser.fromPixels(photoPreview);
.resizeNearestNeighbor([224, 224])
    .expandDims()
    .toFloat()
    .div(tf.scalar(255.0));

    const prediction = coralModel.predict(tensor);
    const generatedScore = prediction.dataSync()[0];
    
    const formData = new FormData(contributionForm);
    const report = {
        latitude: Number(formData.get('latitude')),
        longitude:(formData.get('longitude')),
        score: generatedScore,
        temperature: Number(formData.get('temperature')),
        lumen: Number(formData.get('lumen'))
    };

    const point = turf.point([report.longitude, report.latitude]);
    if (turf.booleanPointInPolygon(point, currentLandMask)) {
        contributionStatus.textContent = 'That location is on land. Choose an offshore location to add a sea marker.';
        return;
    }

    try {
        const reports = JSON.parse(localStorage.getItem(reportStorageKey) || '[]');
        reports.push(report);
        localStorage.setItem(reportStorageKey, JSON.stringify(reports));
    } catch {
        contributionStatus.textContent = 'Could not save this report in browser storage.';
        return;
    }

    AddComunityMarker(report, true);
    contributionForm.reset();
    photoPreview.hidden = true;
    photoPreview.removeAttribute('src');
    if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    photoPreviewUrl = null;
    contributionStatus.textContent = 'Report saved in this browser and added to the map. The photo was previewed only.';
    contributionStatus.classList.add('is-success');
});
