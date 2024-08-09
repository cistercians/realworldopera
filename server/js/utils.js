const NodeGeocoder = require('node-geocoder');
const options = {
  provider: 'mapbox',
  apiKey: 'pk.eyJ1IjoiY2lzdGVyY2lhbmNhcGl0YWwiLCJhIjoiY2s5N2RsczhmMGU1dzNmdGEzdzU2YTZhbiJ9.-xDMU_9FYbMXJf3UD4ocCw'
};
const geocoder = NodeGeocoder(options);
query = require('@derhuerst/query-overpass');
const serp = require("serp");
var dist = require('get-distance-between-points');

Point = function(coords,id){
  var self = {
    id:Math.random(),
    coords:coords,
  }
  if(id){
    self.id = id;
  }
  self.geo = {
    "type":"Feature",
    "id":self.id,
    "geometry":{
      "type":"Point",
      "coordinates":[coords.longitude,coords.latitude]
    }
  }
  return self;
};

web_search = async function(phrase){
  var out = [];
  const links = await serp.search({qs:{q:phrase,filters:0,pws:0}});
  if(links){
    for(n in links){
      var u = links[n].url
      var end = u.indexOf('&ved=');
      var url = u.slice(30,end);
      var link = {
        title:links[n].title,
        url:url
      }
      out.push(link);
      console.log(links[n]);
    }
  }
  console.log(out);
  return out;
};

var toGeo = function(type,coords,id){
  return {
    "type":"Feature",
    "id":id,
    "geometry":{
      "type":type,
      "coordinates":[coords.longitude,coords.latitude]
    }
  }
};

// distance in meters
getDist = function(loc1,loc2){
  var d = dist.getDistanceBetweenPoints(loc1.latitude,loc1.longitude,loc2.latitude,loc2.longitude);
  return d;
};

charCheck = function(phrase){
  for(i in phrase){
    if(Table[phrase[i]]){
      continue;
    } else {
      return false;
    }
  }
  return true;
};

var randomVal = function(min,max){
  return Math.random() * (max - min) + min;
};

getCoords = async function(addr){
  var res = await geocoder.geocode(addr);
  return res[0]
};

hasAddress = async function(lat,lng){
  var res = await geocoder.reverse({lat:lat,lon:lng});
  return res[0]
};

sp_user = function(user){
  return '<span class="user">@' + user + '</span>'
}
sp_project = function(project){
  return '<span class="project">#' + project + '</span>'
}
sp_item = function(item){
  return '<span class="item">!' + item + '</span>'
}
