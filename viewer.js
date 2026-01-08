// ==========================================
// VIEWER LOGIC
// ==========================================

const map = L.map('map').setView([0, 0], 2);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

const pathLayer = L.polyline([], {color: '#007bff', weight: 5}).addTo(map);
const locationMarker = L.circleMarker([0,0], {radius: 8, color: 'blue', fillColor: '#00f', fillOpacity: 1}).addTo(map);
let sessionData = null;

// 1. LOAD FILE
function loadSession(input) {
    const file = input.files[0];
    if (!file) return;

    document.getElementById('loading-msg').style.display = 'block';

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            sessionData = JSON.parse(e.target.result);
            initVisualization();
            document.getElementById('loading-msg').style.display = 'none';
        } catch (err) {
            alert("Error parsing JSON: " + err);
        }
    };
    reader.readAsText(file);
}

// 2. VISUALIZE
function initVisualization() {
    if (!sessionData || !sessionData.track_points) return;

    // A. Draw Path
    const latlngs = sessionData.track_points.map(p => [p.lat, p.lng]);
    pathLayer.setLatLngs(latlngs);
    if (latlngs.length > 0) map.fitBounds(pathLayer.getBounds());

    // B. Draw Photos (Lazy Loading)
    if (sessionData.photos) {
        sessionData.photos.forEach(photo => {
            // RECONSTRUCT CHUNKS
            let imgSrc = "";
            if (photo.src_chunks) {
                imgSrc = photo.src_chunks.join('');
            } else {
                imgSrc = photo.src; // Legacy support
            }

            const photoIcon = L.divIcon({
                html: `<div style="background-image: url('${imgSrc}'); width: 30px; height: 30px;" class="photo-marker"></div>`,
                className: 'photo-marker-container',
                iconSize: [34, 34]
            });

            const compassInfo = photo.heading ? `<br><b>Heading: ${photo.heading}°</b>` : "";

            L.marker([photo.lat, photo.lng], {icon: photoIcon})
                .addTo(map)
                .bindPopup(`<img src="${imgSrc}" style="width:200px; border-radius:8px;">${compassInfo}`);
        });
    }

    // C. Setup Slider
    const slider = document.getElementById('time-slider');
    const container = document.getElementById('scrubber-container');
    
    if (sessionData.track_points.length > 0) {
        container.style.display = 'block';
        slider.max = sessionData.track_points.length - 1;
        slider.value = 0;
        
        slider.oninput = function() {
            const index = parseInt(this.value);
            const point = sessionData.track_points[index];
            updateScrubber(point);
        };
    }
}

// 3. SCRUBBER LOGIC
function updateScrubber(point) {
    locationMarker.setLatLng([point.lat, point.lng]);
    
    // Convert seconds to MM:SS
    const mins = Math.floor(point.time / 60).toString().padStart(2, '0');
    const secs = (point.time % 60).toString().padStart(2, '0');
    document.getElementById('info-display').innerText = `Time: ${mins}:${secs} | Vel: ${point.vel.toFixed(1)} m/s`;
}