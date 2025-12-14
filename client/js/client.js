var socket = io({transports: ['websocket'], upgrade: false});
var client = {name:null, num:null, loc:null, watcher:null, mobile:null};

var enterDiv = document.getElementById('enterDiv');
var enterButton = document.getElementById('enter');
var home = document.getElementById('home');
var menu = document.getElementById('menu');
var globebox = document.getElementById('globe');
var mapbox = document.getElementById('map');
var stream = document.getElementById('stream');
var time = document.getElementById('time');
var text = document.getElementById('text');

const md = new MobileDetect(window.navigator.userAgent);
console.log(md);
if(md.mobile()){
  client.mobile = true;
  globebox.style.display = 'none';
  document.body.style.fontSize = 'xx-large';
  enterDiv.style.display = 'none';
  home.style.display = 'inline';
  //text.focus();
} else {
  client.mobile = false;
  text.focus();
};

var audio = new Audio();
audio.src = '/client/Tosca.mp3';
audio.loop = true;

enterButton.onclick = function(){
  audio.play();
  enterDiv.style.display = 'none';
  home.style.display = 'inline';
  text.focus();
  // Show globe on desktop
  if(!client.mobile){
    globebox.style.display = 'block';
  }
};

// Message batching for performance
var messageQueue = [];
var isScheduled = false;

function scheduleRender() {
  if (isScheduled) return;
  isScheduled = true;
  requestAnimationFrame(renderMessages);
}

function renderMessages() {
  if (messageQueue.length === 0) {
    isScheduled = false;
    return;
  }
  
  const fragment = document.createDocumentFragment();
  
  while (messageQueue.length > 0) {
    const msg = messageQueue.shift();
    const div = document.createElement('div');
    div.className = msg.className || 'line';
    
    const timeEl = document.createElement('p');
    timeEl.textContent = msg.time;
    
    const nameEl = document.createElement('p');
    nameEl.className = 'name';
    nameEl.textContent = ' client: ';
    
    const contentEl = document.createElement('p');
    if (msg.className === 'notif' && msg.isHighlight) {
      const span = document.createElement('span');
      span.className = 'highlight';
      span.innerHTML = msg.content;
      contentEl.appendChild(span);
    } else {
      contentEl.innerHTML = msg.content;
    }
    
    div.appendChild(timeEl);
    div.appendChild(nameEl);
    div.appendChild(contentEl);
    fragment.appendChild(div);
  }
  
  stream.appendChild(fragment);
  stream.scrollTop = stream.scrollHeight;
  
  isScheduled = false;
}

var post_chat = function(name, msg) {
  messageQueue.push({
    time: getTime(),
    content: msg,
    className: 'line'
  });
  scheduleRender();
}

var post_info = function(msg) {
  messageQueue.push({
    time: getTime(),
    content: msg,
    className: 'line info'
  });
  scheduleRender();
}

var post_notif = function(msg) {
  messageQueue.push({
    time: getTime(),
    content: msg,
    className: 'line notif',
    isHighlight: true
  });
  scheduleRender();
}

var getTime = function(){
  var d = new Date();
  var hours = d.getHours();
  var minutes = d.getMinutes();
  var seconds = d.getSeconds();
  if(hours < 10){
    hours = '0' + hours;
  }
  if(minutes < 10){
    minutes = '0' + minutes;
  }
  if(seconds < 10){
    seconds = '0' + seconds;
  }
  var timestring = '[' + hours + ':' + minutes + ':' + seconds + ']';
  return timestring;
};

var checkName = function(name){
  var n = calc(name);
  if(n == client.num){
    return name;
  } else {
    return 'anon';
  }
};

var submitText = function(){
  if(text.value !== ''){
    socket.emit('text', {name:client.name, msg:text.value});
    text.value = '';
  }
};

text.addEventListener('keyup', function(event){
  if(event.keyCode == 13 && !slowdown){
    submitText();
    msgCount++;
  }
});

socket.on('login',function(data){
  client.name = data;
  client.num = calc(data);
  menu.style.display = 'none';
  globebox.style.display = 'none';
  mapbox.style.display = 'block';
  audio.pause();
  build_map();
});

socket.on('project',function(data){
  if(map.getSource('points')){
    client.project = data.project;
    build_geo();
    center_view();
  } else {
    post_notif('map still loading...');
  }
});

socket.on('logout',function(){
  client.name = null;
  client.num = null;
  mapbox.style.display = 'none';
  menu.style.display = 'inline';
  if(!client.mobile){
    globebox.style.display = 'inline';
  }
});

socket.on('notif', function(data){
  post_notif(data.msg);
});

// Research Modal Management
var researchModal = null;
var researchFindingsList = null;
var modalClose = null;
var currentFindings = [];

// Initialize modal elements when DOM is ready
function initResearchModal() {
  researchModal = document.getElementById('researchModal');
  researchFindingsList = document.getElementById('researchFindingsList');
  modalClose = document.getElementById('modalClose');
  
  if (!researchModal || !researchFindingsList) {
    console.warn('Research modal elements not found');
    return;
  }
  
  // Close modal on close button click
  if (modalClose) {
    modalClose.addEventListener('click', closeResearchModal);
  }
  
  // Close modal on backdrop click
  researchModal.addEventListener('click', function(e) {
    if (e.target === researchModal) {
      closeResearchModal();
    }
  });
  
  // Close modal on Escape key
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && researchModal && researchModal.classList.contains('active')) {
      closeResearchModal();
    }
  });
}

function openResearchModal() {
  if (!researchModal) {
    initResearchModal();
  }
  if (researchModal) {
    researchModal.classList.add('active');
  }
}

function closeResearchModal() {
  if (researchModal) {
    researchModal.classList.remove('active');
  }
}

// Initialize modal when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initResearchModal);
} else {
  initResearchModal();
}

function getTypeIcon(type) {
  const icons = {
    entity: '👤',
    location: '📍',
    organization: '🏢',
    keyword: '📝',
  };
  return icons[type] || '📝';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function renderFindings(findings) {
  if (!researchFindingsList) {
    initResearchModal();
  }
  if (!researchFindingsList) {
    console.error('Cannot render findings: researchFindingsList not found');
    return;
  }
  
  currentFindings = findings || [];
  researchFindingsList.innerHTML = '';
  
  if (!findings || findings.length === 0) {
    researchFindingsList.innerHTML = '<div class="no-findings">No findings to review</div>';
    return;
  }
  
  findings.forEach(function(finding) {
    const findingDiv = document.createElement('div');
    findingDiv.className = 'finding-item';
    findingDiv.setAttribute('data-review-id', finding.id);
    
    if (finding.status === 'approved') {
      findingDiv.classList.add('approved');
    } else if (finding.status === 'rejected') {
      findingDiv.classList.add('rejected');
    }
    
    const name = finding.name || finding.extractedData?.name || finding.extractedData?.address || 'unknown';
    const sourceUrl = finding.sourceUrl || '#';
    const typeIcon = getTypeIcon(finding.findingType || finding.type);
    const confidence = finding.confidence || 0;
    const contextSnippet = finding.contextSnippet || finding.context || '';
    const status = finding.status || 'pending';
    
    let statusHtml = '';
    let actionsHtml = '';
    
    if (status === 'pending') {
      actionsHtml = `
        <button class="finding-action-btn approve" data-action="approve" data-review-id="${finding.id}">Approve</button>
        <button class="finding-action-btn reject" data-action="reject" data-review-id="${finding.id}">Reject</button>
      `;
      statusHtml = '<span class="finding-status">Pending</span>';
    } else if (status === 'approved') {
      statusHtml = '<span class="finding-status approved">✓ Approved</span>';
    } else if (status === 'rejected') {
      statusHtml = '<span class="finding-status rejected">✗ Rejected</span>';
    }
    
    findingDiv.innerHTML = `
      <div class="finding-header">
        <span class="finding-type-icon">${typeIcon}</span>
        <div class="finding-name">
          <a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(name)}</a>
        </div>
      </div>
      <div class="finding-meta">
        <span class="finding-confidence">Confidence: ${confidence}/10</span>
        ${statusHtml}
      </div>
      ${contextSnippet ? `<div class="finding-context">${escapeHtml(contextSnippet)}</div>` : ''}
      <div class="finding-source">
        Source: <a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(sourceUrl)}</a>
      </div>
      ${actionsHtml ? `<div class="finding-actions">${actionsHtml}</div>` : ''}
    `;
    
    researchFindingsList.appendChild(findingDiv);
  });
  
  // Attach event listeners to approve/reject buttons
  const actionButtons = researchFindingsList.querySelectorAll('.finding-action-btn');
  actionButtons.forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      const action = btn.getAttribute('data-action');
      const reviewId = btn.getAttribute('data-review-id');
      
      // Disable button immediately for better UX
      btn.disabled = true;
      
      // Emit action event
      socket.emit('action', { type: action, id: reviewId });
    });
  });
}

// Socket listener for review queue data
socket.on('reviewQueue', function(data) {
  if (data && data.findings) {
    renderFindings(data.findings);
    openResearchModal();
  } else {
    console.warn('Invalid reviewQueue data received:', data);
  }
});

socket.on('reviewUpdated', function(data){
  // Update the modal display for the specific review
  if (!researchFindingsList) {
    initResearchModal();
  }
  if (researchFindingsList) {
    const findingDiv = researchFindingsList.querySelector(`[data-review-id="${data.reviewId}"]`);
    if (findingDiv) {
      // Update the finding item class
      findingDiv.classList.remove('approved', 'rejected', 'pending');
      findingDiv.classList.add(data.status);
      
      // Update the status display
      const statusSpan = findingDiv.querySelector('.finding-status');
      if (statusSpan) {
        statusSpan.className = 'finding-status ' + data.status;
        if (data.status === 'approved') {
          statusSpan.textContent = '✓ Approved';
        } else if (data.status === 'rejected') {
          statusSpan.textContent = '✗ Rejected';
        }
      }
      
      // Remove action buttons
      const actionsDiv = findingDiv.querySelector('.finding-actions');
      if (actionsDiv) {
        actionsDiv.remove();
      }
    }
  }
  
  // Also update chat display if it exists (backward compatibility)
  const reviewDiv = stream.querySelector(`[data-review-id="${data.reviewId}"]`);
  if (reviewDiv) {
    const p = reviewDiv.querySelector('p:last-child');
    if (p) {
      if (data.status === 'approved') {
        p.innerHTML = p.innerHTML.replace(/<span[^>]*data-action="approve"[^>]*>approve<\/span> \/ <span[^>]*data-action="reject"[^>]*>reject<\/span>/, '<span style="color: #66bb6a;">✓ approved</span>');
        const link = p.querySelector('a[target="_blank"]');
        if (link) link.style.color = '#66bb6a';
      } else if (data.status === 'rejected') {
        p.innerHTML = p.innerHTML.replace(/<span[^>]*data-action="approve"[^>]*>approve<\/span> \/ <span[^>]*data-action="reject"[^>]*>reject<\/span>/, '<span style="color: #ef5350;">✗ rejected</span>');
        const link = p.querySelector('a[target="_blank"]');
        if (link) {
          link.style.color = '#666';
          link.style.textDecoration = 'line-through';
        }
      }
    }
  }
});

socket.on('chat', function(data){
  const timeHTML = "<p>" + getTime() + "</p><p class='name'>&nbsp;client:&nbsp;</p>";
  
  if(data.name){
    stream.innerHTML += "<div class='line'><p>" + getTime() + "</p><p class='name'>&nbsp;" + checkName(data.name) + ":&nbsp;</p><p>" + data.msg + "</p></div>";
  } else {
    if(data.isHTML) {
      // Render HTML directly and attach event handlers
      const div = document.createElement('div');
      div.className = 'line info';
      
      const timeP = document.createElement('p');
      timeP.textContent = getTime();
      
      const nameP = document.createElement('p');
      nameP.className = 'name';
      nameP.textContent = ' client: ';
      
      const contentP = document.createElement('p');
      contentP.innerHTML = ' ' + data.msg;
      
      div.appendChild(timeP);
      div.appendChild(nameP);
      div.appendChild(contentP);
      
      // Use event delegation on the parent div
      div.addEventListener('click', function(e) {
        const target = e.target;
        if (target.hasAttribute('data-action')) {
          e.preventDefault();
          e.stopPropagation();
          const action = target.getAttribute('data-action');
          const reviewId = target.getAttribute('data-review-id');
          console.log('Button clicked:', action, reviewId);
          socket.emit('action', { type: action, id: reviewId });
          return false;
        }
      });
      
      // Store reviewId on the div for updates
      if (data.reviewId) {
        div.setAttribute('data-review-id', data.reviewId);
      }
      
      stream.appendChild(div);
    } else {
      stream.innerHTML += "<div class='line info'><p>" + getTime() + "</p><p class='name'>&nbsp;client:&nbsp;</p><p> " + data.msg + "</p></div>";
    }
  }
  stream.scrollTop = stream.scrollHeight;
});

socket.on('locate',function(){
  if(!client.loc){
    stream.innerHTML += "<div class='line info'><p>" + getTime() + "</p><p class='name'>&nbsp;client:&nbsp;</p><p> requesting location...</p></div>";
    stream.innerHTML += "<div class='line notif'><span class='highlight'><p>" + getTime() + "</p><p class='name'>&nbsp;client:&nbsp;</p><p> location services disabled on chrome browsers</p></span></div>";
    stream.scrollTop = stream.scrollHeight;
  }
  getLoc();
});

socket.on('orbit',function(){
  if(orbit){
    orbit = false;
  } else {
    orbit = true;
    rotateCamera(0);
  }
});

socket.on('center',function(){
  if(client.project){
    center_view();
  } else {
    stream.innerHTML += "<div class='line notif'><span class='highlight'><p>" + getTime() + "</p><p class='name'>&nbsp;client:&nbsp;</p><p> no #project open</p></span></div>";
    stream.scrollTop = stream.scrollHeight;
  }
})

setInterval(function(){
  time.innerHTML = getTime();
}, 1000);

var getLoc = function(){
  var options = {
      enableHighAccuracy: true,
      timeout: 5000,
      maximumWait: 10000,     // max wait time for desired accuracy
      maximumAge: 0,          // disable cache
      desiredAccuracy: 10,    // meters
      fallbackToIP: true,     // fallback to IP if Geolocation fails or rejected
      addressLookup: false,    // requires Google API key if true
      timezone: false,         // requires Google API key if true
      map: null,      // interactive map element id (or options object)
      staticMap: false         // get a static map image URL (boolean or options object)
  }
  geolocator.locate(options, function (err, location) {
    if(err){
      return console.log(err);
    }
    console.log(location);
    socket.emit('loc', location);
    if(!client.loc){
      stream.innerHTML += "<div class='line info'><p>" + getTime() + "</p><p class='name'>&nbsp;client:&nbsp;</p><p> located in " + location.address.city.toLowerCase() + ", " + location.address.region.toLowerCase() + "</p></div>";
      stream.scrollTop = stream.scrollHeight;
    }
    client.loc = location;
    if(client.mobile){
      client.watcher = geolocator.watch({},function(err, loc){
        if(err) return console.log(err);
        socket.emit('loc', loc);
        client.loc = loc;
        var pt = [loc.coords.longitude,loc.coords.latitude];
        fly(pt);
      })
    }
  })
};

window.onload = function(){
  getLoc();
};

// Mapbox.js
mapboxgl.accessToken = 'pk.eyJ1IjoiY2lzdGVyY2lhbmNhcGl0YWwiLCJhIjoiY2s5N2RsczhmMGU1dzNmdGEzdzU2YTZhbiJ9.-xDMU_9FYbMXJf3UD4ocCw';
map = null;

var build_map = function(){
  var start = {}
  if(!client.loc){
    client.loc = {coords:{longitude:12.4663,latitude:41.9031}};
  }
  if(client.mobile){
    map = new mapboxgl.Map({
      style: 'mapbox://styles/mapbox/dark-v10',
      center: [client.loc.coords.longitude,client.loc.coords.latitude],
      zoom: 17,
      bearing: 0,
      container: 'map'
    });
  } else {
    map = new mapboxgl.Map({
      style: 'mapbox://styles/mapbox/satellite-streets-v11',
      center: [client.loc.coords.longitude,client.loc.coords.latitude],
      zoom: 17,
      pitch: 60,
      bearing: 0,
      container: 'map',
      antialias: true
    });

    // The 'building' layer in the mapbox-streets vector source contains building-height
    // data from OpenStreetMap.
    map.on('load', function(){
      map.addSource('mapbox-dem', {
        'type': 'raster-dem',
        'url': 'mapbox://mapbox.terrain-rgb',
        'tileSize': 512,
        'maxzoom': 14
      })
      map.setTerrain({
        'source': 'mapbox-dem',
        'exaggeration': 1.5
      })

      // Insert the layer beneath any symbol layer.
      var layers = map.getStyle().layers;

      var labelLayerId;
      for(var i = 0; i < layers.length; i++){
        if(layers[i].type === 'symbol' && layers[i].layout['text-field']){
          labelLayerId = layers[i].id;
          break;
        }
      }

      map.addLayer({
        'id': 'sky',
        'type': 'sky',
        'paint': {
          'sky-type': 'atmosphere',
          'sky-atmosphere-sun': [0.0, 90.0],
          'sky-atmosphere-sun-intensity': 15
        }
      });

      // 3d buildings layer
      map.addLayer({
        'id': '3d-buildings',
        'source': 'composite',
        'source-layer': 'building',
        'filter': ['==', 'extrude', 'true'],
        'type': 'fill-extrusion',
        'minzoom': 15,
        'paint': {
          'fill-extrusion-color': '#aaa',

          // use an 'interpolate' expression to add a smooth transition effect to the
          // buildings as the user zooms in
          'fill-extrusion-height': [
            'interpolate',
            ['linear'],
            ['zoom'],
            15,
            0,
            15.05,
            ['get', 'height']
          ],
          'fill-extrusion-base': [
            'interpolate',
            ['linear'],
            ['zoom'],
            15,
            0,
            15.05,
            ['get', 'min_height']
          ],
          'fill-extrusion-opacity': 0.8
        }
      },labelLayerId);

      map.addSource('points',{
        'type':'geojson',
        'data':{
          'type':'FeatureCollection',
          'features':[]
        }
      });
      map.addSource('areas',{
        'type':'geojson',
        'data':{
          'type':'FeatureCollection',
          'features':[]
        }
      });

      map.addLayer({
          'id': 'points',
          'type': 'circle',
          'source': 'points',
          'paint': {
              'circle-color': '#4264fb',
              'circle-radius': 8,
              'circle-stroke-width': 2,
              'circle-stroke-color': '#ffffff'
          }
      });
      map.addLayer({
          'id': 'areas',
          'type': 'fill',
          'source': 'areas',
          'paint': {
              'fill-color': '#0080ff',
              'fill-opacity': 0.2
          }
      });

      const popup = new mapboxgl.Popup({
          closeButton: false,
          closeOnClick: false
      });

      const draw = new MapboxDraw({
        displayControlsDefault: false,
        // Select which mapbox-gl-draw control buttons to add to the map.
        controls: {
            polygon: true,
            trash: true
        },
        // Set mapbox-gl-draw to draw by default.
        // The user does not have to click the polygon control button first.
        //defaultMode: 'draw_polygon'
      });
      map.addControl(draw);

      map.on('mouseenter', 'points', (e) => {
          // Change the cursor style as a UI indicator.
          map.getCanvas().style.cursor = 'pointer';

          // Copy coordinates array.
          const coordinates = e.features[0].geometry.coordinates.slice();
          const description = e.features[0].properties.description;

          // Populate the popup and set its coordinates
          // based on the feature found.
          popup.setLngLat(coordinates).setHTML(description).addTo(map);
      });

      map.on('mouseleave', 'points', () => {
          map.getCanvas().style.cursor = '';
          popup.remove();
      });

      map.addControl(
        new MapboxGeocoder({
          accessToken: mapboxgl.accessToken,
          mapboxgl: mapboxgl
        })
      )

      map.on('dragstart', () => {
        animate = false;
      })
      map.on('pitchstart', () => {
        animate = false;
      })
      map.on('zoomstart', () => {
        animate = false;
      })
      map.on('idle', () => {
        if(!animate){
          animate = true;
          rotateCamera(0);
        }
      })
    })
    rotateCamera(0);
  }
};

var animate = true;
var orbit = true;

var rotateCamera = function(timestamp) {
  if(animate && orbit && !client.mobile){
    // clamp the rotation between 0 -360 degrees
    // Divide timestamp by 100 to slow rotation to ~10 degrees / sec
    map.rotateTo((timestamp / 500) % 360, { duration: 0 });
    // Request the next frame of the animation.
    requestAnimationFrame(rotateCamera);
  }
};

var build_geo = function(){
  var points = [];
  var areas  = [];
  if(client.project){
    for(var i in client.project.loc){
      var loc = client.project.data[client.project.loc[i]];
      if(loc.coords){
        var feature = {
          'type':'Feature',
          'properties':{
            'description':'<strong>'+loc.name+'</strong>'
          },
          'geometry':{
            'type':'Point',
            'coordinates':[loc.coords.longitude,loc.coords.latitude]
          }
        }
        if(loc.description){
          feature['properties']['description'] += '<br><p>' + loc.description + '</p>'
        }
        points.push(feature);
      } else if(loc.bbox){
        var feature = {
          'type':'Feature',
          'properties':{
            'description':'<strong>'+loc.name+'</strong>'
          },
          'geometry':{
            'type':'Polygon',
            'coordinates':[loc.bbox]
          }
        }
        if(loc.description){
          feature['properties']['description'] += '<p>' + loc.description + '</p>'
        }
        areas.push(feature);
      }
    }
  }
  var data_points = {
      'type':'FeatureCollection',
      'features':points
  }
  var data_areas = {
    'type':'FeatureCollection',
    'features':areas
  }
  map.getSource('points').setData(data_points);
  map.getSource('areas').setData(data_areas);
};

var center_view = function(){
  if(client.project){
    var count = 0;
    var total_lat = 0;
    var total_lng = 0;
    var n = null;
    var s = null;
    var e = null;
    var w = null;
    var longs = [];
    var lats = [];
    for(var i in client.project.loc){
      var loc = client.project.data[client.project.loc[i]];
      if(loc.bbox){
        for(var x in loc.bbox){
          count++;
          longs.push(loc.bbox[x][0]);
          total_lng += loc.bbox[x][0]
          lats.push(loc.bbox[x][1]);
          total_lat += loc.bbox[x][1];
        }
      } else {
        count++;
        longs.push(loc.coords.longitude);
        total_lng += loc.coords.longitude;
        lats.push(loc.coords.latitude);
        total_lat += loc.coords.latitude;
      }
    }
    for(var x in longs){
      if(!e){
        e = longs[x];
      } else {
        if(longs[x] > e){
          e = longs[x];
        }
      }
      if(!w){
        w = longs[x];
      } else {
        if(longs[x] < w){
          w = longs[x];
        }
      }
    }
    for(var y in lats){
      if(!n){
        n = lats[y];
      } else {
        if(lats[y] > n){
          n = lats[y];
        }
      }
      if(!s){
        s = lats[y];
      } else {
        if(lats[y] < s){
          s = lats[y];
        }
      }
    }
    var avg_lat = total_lat/count;
    var avg_lng = total_lng/count;
    var ne = [e,n];
    var sw = [w,s];
    n += 0.001;
    e += 0.001;
    s -= 0.001;
    w -= 0.001;
    var ne = [e,n];
    var sw = [w,s];
    fly([avg_lng,avg_lat]);
    map.fitBounds([sw,ne]);
  }
};

var fly = function(loc){
  animate = false;
  map.flyTo({center:loc,essential:true})
  animate = true;
  rotateCamera(0);
};

var msgCount = 0;
var slowdown = false;
var slowCount = 0;
var warn = 1;
setInterval(function(){
  socket.emit('ping');
  if(slowdown){
    slowCount -= 3;
    if(slowCount == 0){
      slowdown = false;
    }
  } else {
    if(msgCount > 3){
      stream.innerHTML += "<div class='line notif'><span class='highlight'><p>" + getTime() + "</p><p class='name'>&nbsp;client:&nbsp;</p><p> slow down! </p></span></div>";
      stream.scrollTop = stream.scrollHeight;
      slowdown = true;
      slowCount = 3 * warn;
      warn++;
    }
  }
  msgCount = 0;
},3000);
