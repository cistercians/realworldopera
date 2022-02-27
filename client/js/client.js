var socket = io({transports: ['websocket'], upgrade: false});
var client = {name:null, num:null, loc:null};

var enterDiv = document.getElementById('enterDiv');
var enterButton = document.getElementById('enter');
var home = document.getElementById('home');
var menu = document.getElementById('menu');
var globebox = document.getElementById('globe');
var mapbox = document.getElementById('map');
var stream = document.getElementById('stream');
var time = document.getElementById('time');
var text = document.getElementById('text');

var audio = new Audio();
audio.src = '/client/Tosca.mp3';
audio.loop = true;

enterButton.onclick = function(){
  audio.play();
  enterDiv.style.display = 'none';
  home.style.display = 'inline';
  text.focus();
};

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
}

var checkName = function(name){
  var n = calc(name);
  if(n == client.num){
    return name;
  } else {
    return 'anonymous';
  }
}

var submitText = function(){
  socket.emit('text', {name:client.name, msg:text.value});
  text.value = '';
}

text.addEventListener('keyup', function(event){
  if(event.keyCode == 13){
    submitText();
  }
});

socket.on('login',function(data){
  if(client.loc){
    client.name = data;
    client.num = calc(data);
    stream.innerHTML += "<div class='line info'><p>" + getTime() + "</p><p class='name'>client:&nbsp;</p><p> you are logged in as " + client.name + "</p></div>";
    menu.style.display = 'none';
    globebox.style.display = 'none';
    mapbox.style.display = 'block';
    buildMap();
  } else {
    stream.innerHTML += "<div class='line info'><p>" + getTime() + "</p><p class='name'>client:&nbsp;</p><p> provide location to login</p></div>"
    getLoc();
  }
});

socket.on('chat', function(data){
  if(data.name){
    stream.innerHTML += "<div class='line'><p>" + getTime() + "</p><p class='name'>" + checkName(data.name) + ":&nbsp;</p><p>" + data.msg + "</p></div>"
  } else {
    stream.innerHTML += "<div class='line info'><p>" + getTime() + "</p><p class='name'>client:&nbsp;</p><p> " + data.msg + "</p></div>"
  }
});

setInterval(function(){
  time.innerHTML = getTime();
}, 1000);

var getLoc = function(){
  var options = {
      enableHighAccuracy: true,
      timeout: 5000,
      maximumWait: 10000,     // max wait time for desired accuracy
      maximumAge: 0,          // disable cache
      desiredAccuracy: 30,    // meters
      fallbackToIP: true,     // fallback to IP if Geolocation fails or rejected
      addressLookup: false,    // requires Google API key if true
      timezone: false,         // requires Google API key if true
      map: null,      // interactive map element id (or options object)
      staticMap: false         // get a static map image URL (boolean or options object)
  }
  geolocator.locate(options, function (err, location) {
      if (err) return console.log(err);
      console.log(location);
      client.loc = [location.coords.longitude, location.coords.latitude];
  });
}

window.onload = function(){
  getLoc();
};

// Mapbox.js
mapboxgl.accessToken = 'pk.eyJ1IjoiY2lzdGVyY2lhbmNhcGl0YWwiLCJhIjoiY2s5N2RsczhmMGU1dzNmdGEzdzU2YTZhbiJ9.-xDMU_9FYbMXJf3UD4ocCw';
map = null;

var buildMap = function(){
  map = new mapboxgl.Map({
    style: 'mapbox://styles/mapbox/satellite-streets-v11',
    center: client.loc,
    zoom: 18,
    pitch: 45,
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
};

// Points of interest
var poi = {
  'type':'geojson',
  'data':{
    'type':'FeatureCollection',
    'features':[]
  }
};

var animate = true;

var rotateCamera = function(timestamp) {
  if(animate){
    // clamp the rotation between 0 -360 degrees
    // Divide timestamp by 100 to slow rotation to ~10 degrees / sec
    map.rotateTo((timestamp / 500) % 360, { duration: 0 });
    // Request the next frame of the animation.
    requestAnimationFrame(rotateCamera);
  }
}

var flyToLoc = function(loc){
  animate = false;
  map.flyTo({center:loc,essential:true})
  animate = true;
  rotateCamera(0);
}
