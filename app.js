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
    value === null || !Number.isFinite(value) ? 'N/A' : value.toFixed(digits)
);

function getZoneStatus(score) {
    if (!Number.isFinite(score)) return { label: 'Unknown class', color: '#8fa9aa' };
    if (score < 0.5) return { label: 'Severely affected (Dead)', color: '#f06464' };
    if (score < 1.5) return { label: 'At risk (Bleached)', color: '#f5b942' };
    return { label: 'Healthy', color: '#19c7a3' };
}

function getModelClassStatus(classScore) {
    if (!Number.isFinite(classScore) || classScore < 0 || classScore > 2) {
        return { label: 'Unknown class', color: '#8fa9aa' };
    }
    if (classScore < 0.5) return { label: 'Severely affected (Dead)', color: '#f06464' };
    if (classScore < 1.5) return { label: 'At risk (Bleached)', color: '#f5b942' };
    return { label: 'Healthy', color: '#19c7a3' };
}

function getHealthClass(score) {
    if (score >= 1.5) return 2;
    if (score >= 0.5) return 1;
    return 0;
}

function normalizeModelPrediction(prediction) {
    if (!prediction) return null;

    const probabilities = Array.isArray(prediction.probabilities)
        ? prediction.probabilities
        : [];
    const predictedClass = Number.isInteger(prediction.predictedClass)
        ? prediction.predictedClass
        : prediction.classIndex;
    const expectedClass = Number.isFinite(prediction.expectedClass)
        ? prediction.expectedClass
        : probabilities.length && probabilities.every(Number.isFinite)
            ? probabilities.reduce((total, probability, index) => total + probability * index, 0)
            : predictedClass;

    if (!Number.isInteger(predictedClass) || !Number.isFinite(expectedClass)) return null;

    return {
        expectedClass,
        predictedClass,
        topProbability: Number.isFinite(prediction.topProbability)
            ? prediction.topProbability
            : probabilities[predictedClass] ?? 0,
        probabilities
    };
}

function addCommunityMarker(report, focus = false) {
    const modelPrediction = normalizeModelPrediction(report.modelPrediction);
    const modelStatus = modelPrediction
        ? getModelClassStatus(modelPrediction.expectedClass)
        : null;
    const marker = L.circleMarker([report.latitude, report.longitude], {
        radius: 7,
        color: '#f3fbf9',
        weight: 1.5,
        fillColor: modelStatus ? modelStatus.color : getZoneStatus(report.score).color,
        fillOpacity: 1
    }).addTo(communityReports);

    marker.bindPopup(
        '<strong>Community report</strong><br>' +
        (modelPrediction
            ? `AI health score: ${modelPrediction.expectedClass.toFixed(2)} (${modelStatus.label})<br>` +
              `Most likely class: ${modelPrediction.predictedClass} (${getModelClassStatus(modelPrediction.predictedClass).label})<br>` +
              `Top class probability: ${(modelPrediction.topProbability * 100).toFixed(1)}%<br>` +
              `Class probabilities: ${modelPrediction.probabilities.map((value, index) => `${index}: ${(value * 100).toFixed(1)}%`).join(', ')}<br>`
            : `Health: ${report.score.toFixed(1)}<br>`) +
        `Temperature: ${formatMetric(report.temperature, 1)} °C<br>` +
        `Light: ${formatMetric(report.lumen, 0)} lux`
    );
    marker.on('click', () => renderZoneInfo({
        meanScore: report.score,
        meanTemp: report.temperature,
        meanLumen: report.lumen,
        dataCount: 1,
        modelPrediction
    }));
    if (focus) map.panTo([report.latitude, report.longitude]);
}

function renderZoneInfo(properties) {
    const modelPrediction = normalizeModelPrediction(properties.modelPrediction);
    const classScore = modelPrediction
        ? modelPrediction.expectedClass
        : Number.isFinite(properties.meanClass) ? properties.meanClass : null;
    const status = classScore === null
        ? getZoneStatus(properties.meanScore)
        : getModelClassStatus(classScore);
    zoneInfo.innerHTML = `
        <div class="zone-status" style="--status-color: ${status.color}">
            <span class="status-dot"></span>${status.label}
        </div>
        <div class="metrics">
            <div class="metric-card">
                <span class="metrics-title">${classScore === null ? 'Average health score' : modelPrediction ? 'AI health score' : 'Mean health score'}</span>
                <strong class="metrics-value">${classScore === null ? properties.meanScore.toFixed(2) : classScore.toFixed(2)}</strong>
            </div>
            ${modelPrediction ? `
            <div class="metric-card">
                <span class="metrics-title">Most likely class ${modelPrediction.predictedClass}: ${getModelClassStatus(modelPrediction.predictedClass).label}</span>
                <strong class="metrics-value">${(modelPrediction.topProbability * 100).toFixed(1)}<small>%</small></strong>
                <p class="data-count">Class probabilities: ${modelPrediction.probabilities.map((value, index) => `${index}: ${(value * 100).toFixed(1)}%`).join(', ')}</p>
            </div>` : ''}
            <div class="metric-card">
                <span class="metrics-title">Water temperature</span>
                <strong class="metrics-value">${formatMetric(properties.meanTemp, 1)}<small>°C</small></strong>
            </div>
            <div class="metric-card">
                <span class="metrics-title">Light level</span>
                <strong class="metrics-value">${formatMetric(properties.meanLumen, 0)}<small> lux</small></strong>
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
                `Health: ${properties.score.toFixed(2)} (${getZoneStatus(properties.score).label})<br>` +
                `Temperature: ${formatMetric(properties.temperature, 1)} °C<br>` +
                `Light: ${formatMetric(properties.lumen, 0)} lux`
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
            const classValues = readings
                .map((point) => point.properties?.score)
                .filter((value) => typeof value === 'number' && Number.isFinite(value))
                .map(getHealthClass);
            hex.properties.meanClass = classValues.length
                ? classValues.reduce((total, value) => total + value, 0) / classValues.length
                : null;
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
                const classScore = feature.properties.meanClass;
                return {
                    fillColor: classScore === null
                        ? '#65727d'
                        : getModelClassStatus(classScore).color,
                    color: '#d8e5e9',
                    weight: 0.7,
                    fillOpacity: classScore === null ? 0.08 : 0.72
                };
            },
            onEachFeature: (feature, layer) => {
                const properties = feature.properties;
                if (properties.meanScore === null) return;
                const meanStatus = getModelClassStatus(properties.meanClass);

                layer.bindPopup(
                    `<strong>${meanStatus.label}</strong><br>` +
                    `Avg health: ${properties.meanScore.toFixed(2)}<br>` +
                    `Mean health class: ${properties.meanClass.toFixed(2)}<br>` +
                    `Avg temperature: ${formatMetric(properties.meanTemp, 1)} °C<br>` +
                    `Avg light: ${formatMetric(properties.meanLumen, 0)} lux<br>` +
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
const scoreInput = document.getElementById('score');
const scoreHelp = document.getElementById('score-help');
let photoPreviewUrl = null;
let coralModel = null;

if (typeof tf === 'undefined') {
    scoreHelp.textContent = 'TensorFlow.js did not load. Enter the observed score manually.';
} else {
    tf.loadGraphModel('./model.json')
        .then((model) => {
            coralModel = model;
            scoreInput.required = false;
            scoreInput.disabled = true;
            scoreInput.placeholder = 'AI calculated';
            scoreHelp.textContent = 'The model predicts the score from the reef photo.';
            contributionStatus.textContent = 'CoralEye image model loaded.';
        })
        .catch((error) => {
            console.warn('The CoralEye GraphModel could not be loaded:', error);
            scoreInput.required = true;
            scoreInput.disabled = false;
            scoreHelp.textContent = `${error.message} Enter the observed score manually for now.`;
            contributionStatus.textContent = 'AI scoring is unavailable until the model files are complete. Manual scoring is available.';
        });
}

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

contributionForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    contributionStatus.classList.remove('is-success');

    if (!currentLandMask) {
        contributionStatus.textContent = 'The coastline is still loading. Try again in a moment.';
        return;
    }

    const formData = new FormData(contributionForm);
    const latitude = Number(formData.get('latitude'));
    const longitude = Number(formData.get('longitude'));
    const point = turf.point([longitude, latitude]);

    if (turf.booleanPointInPolygon(point, currentLandMask)) {
        contributionStatus.textContent = 'That location is on land. Choose an offshore location to add a sea marker.';
        return;
    }

    let score = Number(formData.get('score'));
    let modelPrediction = null;
    if (coralModel) {
        contributionStatus.textContent = 'Analyzing reef photo...';
        let inputTensor;
        let prediction;

        try {
            await photoPreview.decode();
            inputTensor = tf.browser.fromPixels(photoPreview)
                .resizeBilinear([224, 224])
                .expandDims(0)
                .toFloat();
            prediction = coralModel.execute(inputTensor);
            const predictionTensor = Array.isArray(prediction) ? prediction[0] : prediction;
            const rawProbs = Array.from(await predictionTensor.data());

            // Remap alphabetical training order [Bleached, Dead, Healthy] -> severity order [Dead (0), Bleached (1), Healthy (2)]
            const probabilities = [rawProbs[1], rawProbs[0], rawProbs[2]];
            const predictedClass = probabilities.reduce((bestIndex, value, index, values) => (
                value > values[bestIndex] ? index : bestIndex
            ), 0);
            const expectedClass = probabilities.reduce((total, probability, index) => (
                total + probability * index
            ), 0);
            score = expectedClass;
            modelPrediction = {
                expectedClass,
                predictedClass,
                topProbability: probabilities[predictedClass],
                probabilities
            };
        } catch (error) {
            console.error('Inference error:', error);
            scoreInput.disabled = false;
            scoreInput.required = true;
            scoreHelp.textContent = 'Image analysis failed. Enter the observed score manually.';
            contributionStatus.textContent = 'Could not analyze the photo. You can enter the score manually.';
            return;
        } finally {
            inputTensor?.dispose();
            if (Array.isArray(prediction)) prediction.forEach((output) => output.dispose());
            else prediction?.dispose();
        }
    }

    if (!Number.isFinite(score)) {
        contributionStatus.textContent = 'Enter a valid health score or upload a photo after the model loads.';
        return;
    }

    const report = {
        latitude,
        longitude,
        score,
        temperature: Number(formData.get('temperature')),
        lumen: Number(formData.get('lumen')),
        modelPrediction
    };

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
    contributionStatus.textContent = coralModel
        ? `Report saved. AI health score ${modelPrediction.expectedClass.toFixed(2)} (${getModelClassStatus(modelPrediction.expectedClass).label}); most likely class ${modelPrediction.predictedClass} at ${(modelPrediction.topProbability * 100).toFixed(1)}%.`
        : 'Report saved in this browser and added to the map. The photo was previewed only.';
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
            iconSize: [14, 14],
            iconAnchor: [7, 7]
        }),
        keyboard: false,
        interactive: false
    }).addTo(map);
    contributionStatus.textContent = 'Offshore location selected. Complete the remaining fields to add your report.';
});
