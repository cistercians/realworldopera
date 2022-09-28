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
  buildMap();
});

socket.on('logout',function(){
  client.name = null;
  client.num = null;
  mapbox.style.display = 'none';
  menu.style.display = 'inline';
  if(!client.mobile){
    globe.style.display = inline;
  }
});

socket.on('notif', function(data){
  stream.innerHTML += "<div class='line notif'><span class='highlight'><p>" + getTime() + "</p><p class='name'>&nbsp;client:&nbsp;</p><p> " + data.msg + "</p></span></div>";
  stream.scrollTop = stream.scrollHeight;
});

socket.on('chat', function(data){
  if(data.name){
    stream.innerHTML += "<div class='line'><p>" + getTime() + "</p><p class='name'>&nbsp;" + checkName(data.name) + ":&nbsp;</p><p>" + data.msg + "</p></div>";
  } else {
    stream.innerHTML += "<div class='line info'><p>" + getTime() + "</p><p class='name'>&nbsp;client:&nbsp;</p><p> " + data.msg + "</p></div>";
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

var buildMap = function(){
  var start = {}
  if(!client.loc){
    client.loc = {coords:{longitude:12.4663,latitude:41.9031}};
  }
  if(client.mobile){
    map = new mapboxgl.Map({
      style: 'mapbox://styles/mapbox/dark-v10',
      center: [client.loc.coords.longitude,client.loc.coords.latitude],
      zoom: 18,
      bearing: 0,
      container: 'map'
    });
  } else {
    map = new mapboxgl.Map({
      style: 'mapbox://styles/mapbox/satellite-streets-v11',
      center: [client.loc.coords.longitude,client.loc.coords.latitude],
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
  }
};

var animate = true;

var rotateCamera = function(timestamp) {
  if(animate && !client.mobile){
    // clamp the rotation between 0 -360 degrees
    // Divide timestamp by 100 to slow rotation to ~10 degrees / sec
    map.rotateTo((timestamp / 500) % 360, { duration: 0 });
    // Request the next frame of the animation.
    requestAnimationFrame(rotateCamera);
  }
};

var points_of_interest = [];
var toGeo = function(points){
  return "{ 'type': 'FeatureCollection','features': " + points + "}"
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
      stream.innerHTML += "<div class='line notif'><p>" + getTime() + "</p><p class='name'>&nbsp;client:&nbsp;</p><p> slow down! </p></div>";
      slowdown = true;
      slowCount = 3 * warn;
      warn++;
    }
  }
  msgCount = 0;
},3000);
