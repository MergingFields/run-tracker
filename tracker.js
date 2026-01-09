// ==========================================
// CONFIGURATION & STATE
// ==========================================
let COMPASS_MODE = "DEMAND"; // Default: "DEMAND" (Eco/Walking) or "CONTINUOUS" (Running)
let trackData = [];
let photoData = [];
let watchID = null;
let tracking = false;
let startTime = null;
let lastPos = null;
let lastTime = null;
let totalDistance = 0;
let currentHeading = 0; // Stores continuous heading if active

// ==========================================
// 1. SETUP MAP
// ==========================================
const map = L.map('map').setView([0, 0], 2);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

const pathLayer = L.polyline([], {color: '#dc3545', weight: 5}).addTo(map);

// ==========================================
// 2. COMPASS LOGIC
// ==========================================
function toggleCompassMode() {
    const checkbox = document.getElementById('compass-toggle');
    const label = document.querySelector('.mode-label');
    
    if (checkbox.checked) {
        COMPASS_MODE = "CONTINUOUS";
        label.innerText = "Mode: Running (Continuous Compass)";
        // If we are already tracking, turn it on immediately
        if (tracking) startCompassListener();
    } else {
        COMPASS_MODE = "DEMAND";
        label.innerText = "Mode: Walking (Eco / Event-Based)";
        stopCompassListener();
    }
}

function startCompassListener() {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission().then(r => {
            if (r === 'granted') window.addEventListener('deviceorientation', handleOrientation);
        });
    } else {
        window.addEventListener('deviceorientation', handleOrientation);
    }
}

function stopCompassListener() {
    window.removeEventListener('deviceorientation', handleOrientation);
}

function handleOrientation(e) {
    if (e.webkitCompassHeading) currentHeading = e.webkitCompassHeading;
    else if (e.alpha) currentHeading = 360 - e.alpha;
}

// THE KEY FUNCTION: Gets heading based on current mode
function getHeadingNow() {
    return new Promise((resolve) => {
        // A. Continuous Mode: Instant return
        if (COMPASS_MODE === "CONTINUOUS") {
            resolve(currentHeading);
            return;
        }

        // B. Walking Mode: Wake up sensor, read, sleep
        const handler = (e) => {
            let h = e.webkitCompassHeading || (360 - e.alpha) || 0;
            window.removeEventListener('deviceorientation', handler);
            resolve(h);
        };
        
        window.addEventListener('deviceorientation', handler);
        // Timeout 500ms safety if sensor is dead
        setTimeout(() => {
            window.removeEventListener('deviceorientation', handler);
            resolve(0);
        }, 500);
    });
}

// ==========================================
// 3. TRACKING LOGIC
// ==========================================
function toggleTracking(start) {
    tracking = start;
    updateUI(start);

    if (start) {
        if (!startTime) resetRun();

        // Start GPS
        if (navigator.geolocation) {
            watchID = navigator.geolocation.watchPosition(
                updatePosition,
                (err) => console.error(err),
                { enableHighAccuracy: true, maximumAge: 1000 }
            );
        }
        // Start Compass (only if Running mode)
        if (COMPASS_MODE === "CONTINUOUS") startCompassListener();

    } else {
        // Stop Everything
        if (watchID) navigator.geolocation.clearWatch(watchID);
        watchID = null;
        stopCompassListener(); // Always stop compass on pause to save battery
    }
}

function updatePosition(position) {
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    const currentTime = position.timestamp;
    let v_current = position.coords.speed || 0;
    
    // Update Stats
    if (lastPos && lastTime) {
        const distStep = map.distance([lastPos.latitude, lastPos.longitude], [lat, lng]);
        totalDistance += distStep;
    }

    document.getElementById('vel').innerText = v_current.toFixed(1);
    document.getElementById('dist').innerText = Math.round(totalDistance);
    
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const secs = (elapsed % 60).toString().padStart(2, '0');
    document.getElementById('time').innerText = `${mins}:${secs}`;

    // Map & Data
    pathLayer.addLatLng([lat, lng]);
    map.setView([lat, lng], 18);

    trackData.push({
        time: elapsed,
        absTime: currentTime,
        lat: lat,
        lng: lng,
        vel: v_current
    });

    lastPos = { latitude: lat, longitude: lng, speed: v_current };
    lastTime = currentTime;
}

// ==========================================
// 4. PHOTO LOGIC (SHARED & MODULAR)
// ==========================================
function chunkString(str, length) {
    return str.match(new RegExp('.{1,' + length + '}', 'g'));
}

// NEW: Core function that accepts raw image data from ANY source (File or Camera)
function addPhotoToTrack(imgData, heading) {
    const lat = lastPos ? lastPos.latitude : map.getCenter().lat;
    const lng = lastPos ? lastPos.longitude : map.getCenter().lng;

    // Map Marker
    const photoIcon = L.divIcon({
        html: `<div style="background-image: url('${imgData}'); width: 40px; height: 40px;" class="photo-marker"></div>`,
        className: 'photo-marker-container',
        iconSize: [44, 44],
        iconAnchor: [22, 44]
    });

    L.marker([lat, lng], {icon: photoIcon})
        .addTo(map)
        .bindPopup(`<img src="${imgData}" style="width:100px;"><br>Heading: ${Math.round(heading)}°`);
    
    // SAVE DATA
    photoData.push({
        lat: lat,
        lng: lng,
        heading: Math.round(heading),
        src_chunks: chunkString(imgData, 100),
        timestamp: Date.now()
    });
}

// EXISTING: Handles File Input (Battery Saver Mode)
async function handlePhoto(input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        
        // Get Compass (Async)
        const heading = await getHeadingNow();

        const reader = new FileReader();
        reader.onload = function(e) {
            // Pass the result to the shared function
            addPhotoToTrack(e.target.result, heading);
        };
        reader.readAsDataURL(file);
    }
}

// ==========================================
// 5. EXPORT & UTILS
// ==========================================
function downloadRun(includePhotos) {
    const dataObj = {
        version: "2.0",
        date: new Date().toISOString(),
        total_dist: totalDistance,
        duration: document.getElementById('time').innerText,
        track_points: trackData,
        photos: includePhotos ? photoData : [] 
    };

    const blob = new Blob([JSON.stringify(dataObj)], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    
    const now = new Date();
    const timeString = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const type = includePhotos ? "FULL" : "TRACK";
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `Run_${timeString}_${type}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
}

function saveAndReset() {
    downloadRun(true); 
    setTimeout(() => {
        if(confirm("Download started? Press OK to reset memory.")) window.location.reload(); 
    }, 1000); 
}

function resetRun() {
    startTime = Date.now();
    trackData = [];
    photoData = [];
    pathLayer.setLatLngs([]);
    totalDistance = 0;
    document.getElementById('dist').innerText = "0";
}

function updateUI(isRunning) {
    document.getElementById('btn-start').style.display = isRunning ? 'none' : 'block';
    document.getElementById('btn-stop').style.display = isRunning ? 'block' : 'none';
    document.getElementById('save-options').style.display = isRunning ? 'none' : 'grid';
    document.getElementById('btn-reset').style.display = isRunning ? 'none' : 'block';
    if(isRunning) document.getElementById('btn-start').innerText = "Resume Run";
}