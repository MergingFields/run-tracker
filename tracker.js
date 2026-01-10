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
let timerInterval = null; 

// ==========================================
// 1. SETUP MAP & RESTORE LOGIC
// ==========================================
const map = L.map('map').setView([0, 0], 2);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

const pathLayer = L.polyline([], {color: '#dc3545', weight: 5}).addTo(map);

// --- NEW: AUTO-RESTORE ON LOAD ---
window.onload = function() {
    restoreRunFromMemory();
};

function restoreRunFromMemory() {
    const savedTrack = localStorage.getItem('run_track');
    const savedDist = localStorage.getItem('run_dist');
    const savedStart = localStorage.getItem('run_start');

    if (savedTrack && savedStart) {
        const resume = confirm("⚠️ CRASH DETECTED ⚠️\nFound an unfinished run in memory.\n\nRestore GPS path?");
        if (resume) {
            // 1. Restore Variables
            trackData = JSON.parse(savedTrack);
            totalDistance = parseFloat(savedDist);
            startTime = parseInt(savedStart);
            
            // 2. Restore Map Path
            const latLngs = trackData.map(p => [p.lat, p.lng]);
            pathLayer.setLatLngs(latLngs);
            if (latLngs.length > 0) {
                map.setView(latLngs[latLngs.length - 1], 16);
                lastPos = { 
                    latitude: latLngs[latLngs.length - 1][0], 
                    longitude: latLngs[latLngs.length - 1][1] 
                };
            }

            // 3. Restore UI
            document.getElementById('dist').innerText = Math.round(totalDistance);
            toggleTracking(false); // Ready to resume, but paused
            document.getElementById('btn-start').innerText = "Resume Run";
            updateUI(false); 
            
            // 4. Update timer immediately
            updateTimeDisplay();
        } else {
            // User chose to discard
            clearMemory();
        }
    }
}

function saveToMemory() {
    if (!startTime) return;
    try {
        localStorage.setItem('run_track', JSON.stringify(trackData));
        localStorage.setItem('run_dist', totalDistance);
        localStorage.setItem('run_start', startTime);
    } catch (e) {
        console.warn("Storage full! Track path getting too long.");
    }
}

function clearMemory() {
    localStorage.removeItem('run_track');
    localStorage.removeItem('run_dist');
    localStorage.removeItem('run_start');
}

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
// 3. TRACKING LOGIC
// ==========================================
function toggleTracking(start) {
    tracking = start;
    updateUI(start);

    if (start) {
        if (!startTime) {
            startTime = Date.now(); // Set start time if new run
            saveToMemory(); // Initialize save
        }
        
        clearInterval(timerInterval);
        timerInterval = setInterval(updateTimeDisplay, 1000);

        // Start GPS
        if (navigator.geolocation) {
            watchID = navigator.geolocation.watchPosition(
                updatePosition,
                (err) => {
                    // SILENT ERROR HANDLING (No Alert to freeze Pocket Mode)
                    console.warn("GPS Error:", err);
                    document.getElementById('dist').innerText = "GPS Lost";
                },
                { enableHighAccuracy: true, maximumAge: 1000 }
            );
        } else {
            console.error("GPS not supported");
        }

        if (COMPASS_MODE === "CONTINUOUS") startCompassListener();

    } else {
        if (watchID) navigator.geolocation.clearWatch(watchID);
        watchID = null;
        clearInterval(timerInterval); 
        stopCompassListener();
        saveToMemory(); // Force save on pause
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
    
    // --- NEW: AUTO-SAVE ON EVERY STEP ---
    saveToMemory();
}

// ==========================================
// 4. PHOTO LOGIC
// ==========================================
function chunkString(str, length) {
    return str.match(new RegExp('.{1,' + length + '}', 'g'));
}

function addPhotoToTrack(imgData, heading) {
    if (!lastPos) {
        alert("⚠️ GPS Searching... \nWait for map to zoom.");
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
    
    // NOTE: We do NOT save photoData to localStorage (too big).
    // Photos are currently RAM only.
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
    const count = photoData.length;
    // Basic confirm to ensure user knows what they are saving
    if (includePhotos && count === 0) {
        alert("Notice: No photos in memory to save.");
    }

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
        if(confirm("Run saved? Clear memory and start new?")) {
            clearMemory(); // Wipes the safety backup
            window.location.reload(); 
        }
    }, 1000); 
}

function resetRun() {
    startTime = Date.now();
    trackData = [];
    photoData = [];
    pathLayer.setLatLngs([]);
    totalDistance = 0;
    lastPos = null;
    clearMemory(); // Clear old crash data on new run
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