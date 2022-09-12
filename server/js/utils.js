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

search = async function(phrase){
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

hasAddress = async function(coords){
  var res = await geocoder.reverse(coords);
  console.log(res);
  return res;
};
