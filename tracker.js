// ==========================================
// CONFIGURATION & STATE
// ==========================================
let COMPASS_MODE = "DEMAND"; 
let trackData = [];
let photoData = [];
let watchID = null;
let tracking = false;
let startTime = null;
let lastPos = null;
let totalDistance = 0;
let timerInterval = null; // NEW: Timer runs independently of GPS

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

function getHeadingNow() {
    return new Promise((resolve) => {
        if (COMPASS_MODE === "CONTINUOUS") {
            resolve(currentHeading || 0);
            return;
        }
        const handler = (e) => {
            let h = e.webkitCompassHeading || (360 - e.alpha) || 0;
            window.removeEventListener('deviceorientation', handler);
            resolve(h);
        };
        window.addEventListener('deviceorientation', handler);
        setTimeout(() => {
            window.removeEventListener('deviceorientation', handler);
            resolve(0);
        }, 500);
    });
}

// ==========================================
// 3. TRACKING LOGIC (IMPROVED)
// ==========================================
function toggleTracking(start) {
    tracking = start;
    updateUI(start);

    if (start) {
        if (!startTime) resetRun();
        
        // NEW: Start the visual timer immediately!
        clearInterval(timerInterval);
        timerInterval = setInterval(updateTimeDisplay, 1000);

        // Start GPS
        if (navigator.geolocation) {
            watchID = navigator.geolocation.watchPosition(
                updatePosition,
                (err) => {
                    // NEW: Alert the user if GPS fails!
                    alert("GPS Error: " + err.message + "\nCheck iPhone Settings > Privacy > Location Services");
                },
                { enableHighAccuracy: true, maximumAge: 1000 }
            );
        } else {
            alert("GPS not supported on this browser.");
        }

        if (COMPASS_MODE === "CONTINUOUS") startCompassListener();

    } else {
        // Stop Everything
        if (watchID) navigator.geolocation.clearWatch(watchID);
        watchID = null;
        clearInterval(timerInterval); // Stop timer
        stopCompassListener();
    }
}

function updateTimeDisplay() {
    if (!startTime) return;
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const secs = (elapsed % 60).toString().padStart(2, '0');
    document.getElementById('time').innerText = `${mins}:${secs}`;
}

function updatePosition(position) {
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    // const accuracy = position.coords.accuracy; // (Optional: useful for debugging)
    
    // Only center map if this is the first point or we moved significantly
    if (!lastPos) {
        map.setView([lat, lng], 18);
    }

    let v_current = position.coords.speed || 0;
    
    if (lastPos) {
        const distStep = map.distance([lastPos.latitude, lastPos.longitude], [lat, lng]);
        totalDistance += distStep;
    }

    document.getElementById('vel').innerText = v_current.toFixed(1);
    document.getElementById('dist').innerText = Math.round(totalDistance);
    
    // Map & Data
    pathLayer.addLatLng([lat, lng]);
    
    trackData.push({
        time: (Date.now() - startTime) / 1000,
        absTime: position.timestamp,
        lat: lat,
        lng: lng,
        vel: v_current
    });

    lastPos = { latitude: lat, longitude: lng, speed: v_current };
}

// ==========================================
// 4. PHOTO LOGIC (SHARED)
// ==========================================
function chunkString(str, length) {
    return str.match(new RegExp('.{1,' + length + '}', 'g'));
}

function addPhotoToTrack(imgData, heading) {
    // 1. SAFETY CHECK
    if (!lastPos) {
        alert("⚠️ GPS Searching... \nWait for the map to zoom to your location.");
        return; 
    }

    const lat = lastPos.latitude;
    const lng = lastPos.longitude;

    const photoIcon = L.divIcon({
        html: `<div style="background-image: url('${imgData}'); width: 40px; height: 40px;" class="photo-marker"></div>`,
        className: 'photo-marker-container',
        iconSize: [44, 44],
        iconAnchor: [22, 44]
    });

    L.marker([lat, lng], {icon: photoIcon})
        .addTo(map)
        .bindPopup(`<img src="${imgData}" style="width:100px;"><br>Heading: ${Math.round(heading)}°`);
    
    photoData.push({
        lat: lat,
        lng: lng,
        heading: Math.round(heading),
        src_chunks: chunkString(imgData, 100),
        timestamp: Date.now()
    });
}

async function handlePhoto(input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        const heading = await getHeadingNow();
        const reader = new FileReader();
        reader.onload = function(e) {
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
    setTimeout(() => URL.revokeObjectURL(url), 100);
}

function saveAndReset() {
    downloadRun(true); 
    setTimeout(() => {
        if(confirm("Download started? Reset run?")) window.location.reload(); 
    }, 1000); 
}

function resetRun() {
    startTime = Date.now();
    trackData = [];
    photoData = [];
    pathLayer.setLatLngs([]);
    totalDistance = 0;
    lastPos = null;
    document.getElementById('dist').innerText = "0";
    document.getElementById('time').innerText = "00:00";
}

function updateUI(isRunning) {
    document.getElementById('btn-start').style.display = isRunning ? 'none' : 'block';
    document.getElementById('btn-stop').style.display = isRunning ? 'block' : 'none';
    document.getElementById('save-options').style.display = isRunning ? 'none' : 'grid';
    document.getElementById('btn-reset').style.display = isRunning ? 'none' : 'block';
    if(isRunning) document.getElementById('btn-start').innerText = "Resume Run";
}