query = require('@derhuerst/query-overpass');
const Supercluster = require('supercluster');
const index = new Supercluster({
  maxZoom:10,
  minPoints:1
});
const NodeGeocoder = require('node-geocoder');
const options = {
  provider: 'openstreetmap',
  formatter: null,
  'user-agent': 'aleph'
};
const geocoder = NodeGeocoder(options);

var toGeo = function(coords,id){
  return {
    "type":"Feature",
    "id":id,
    "geometry":{
      "type":"Point",
      "coordinates":[coords.longitude,coords.latitude]
    }
  }
};

var randomVal = function(min,max){
  return Math.random() * (max - min) + min;
}

randomUser = function(){
  var users = [];
  for(i in SOCKET_LIST){
    if(SOCKET_LIST[i].name){
      users.push(SOCKET_LIST[i].id);
    }
  }
  var id = users[Math.floor(Math.random() * users.length)];
  return id;
};

hasAddress = async function(coords){
  var res = await geocoder.reverse(coords);
  console.log(res);
  return res;
};

buildClusters = function(){
  var points = [];
  for(i in SOCKET_LIST){
    var user = SOCKET_LIST[i];
    var point = toGeo(user.loc.coords,user.id);
    points.push(point);
  }
  index.load(points);
};

buildBox = function(r,loc){
  var box = [loc.longitude-r,loc.latitude-r,loc.longitude+r,loc.latitude+r];
  return box;
};

queryBox = function(bbox){
  var box = '[bbox:' + bbox[1].toString() + ',' + bbox[0].toString() + ',' + bbox[3].toString() + ',' + bbox[2].toString() + '];';
  return box;
};

getMetadata = function(data){
  var tags = data.tags;
  var meta = {
    name:tags.name
  }
  if(tags['addr:housenumber']){
    meta.street_number = tags['addr:housenumber'];
  }
  if(tags['addr:street']){
    meta.street = tags['addr:street'];
  }
  if(tags.amenity){
    meta.amenity = tags.amenity;
  }
  if(tags.brand){
    meta.brand = tags.brand;
  }
  if(tags['brand:wikidata']){
    meta.brand_wikidata = tags['brand:wikidata'];
  }
  if(tags.building && tags.building !== 'yes'){
    meta.building = tags.building;
  }
  if(tags.cuisine){
    meta.cuisine = tags.cuisine;
  }
  if(tags.denomination){
    meta.denomination = tags.denomination;
  }
  if(tags.description){
    meta.description = tags.description;
  }
  if(tags.email){
    meta.email = tags.email;
  }
  if(tags.inscription){
    meta.inscription = tags.inscription;
  }
  if(tags.material){
    meta.material = tags.material;
  }
  if(tags.old_name){
    meta.old_name = tags.old_name;
  }
  if(tags.operator){
    meta.operator = tags.operator;
  }
  if(tags.phone){
    meta.phone = tags.phone;
  }
  if(tags.ref){
    meta.ref = tags.ref;
  }
  if(tags.religion){
    meta.religion = tags.religion;
  }
  if(tags.shop){
    meta.shop = tags.shop;
  }
  if(tags.short_name){
    meta.short_name = tags.short_name;
  }
  if(tags.start_date){
    meta.start_date = tags.start_date;
  }
  if(tags.url){
    meta.url = tags.url;
  }
  if(tags.website){
    meta.website = tags.website;
  }
  if(tags.wikidata){
    meta.wikidata = tags.wikidata;
  }
  return meta;
}

newObjective = function(){
  var loc = SOCKET_LIST[randomUser()].loc.coords;
  var bbox = buildBox(0.12,loc);
  var clusters = index.getClusters(bbox,9);
  var users = [];
  for(i in clusters){
    var cluster = clusters[i];
    if(cluster.properties){
      var leaves = index.getLeaves(cluster.id, Infinity);
      for(l in leaves){
        var leaf = leaves[l];
        users.push(leaf.id);
      }
    } else {
      users.push(cluster.id);
    }
  }
  console.log('users found: ' + users.length);
  var q = "[out:json][timeout:25]" + queryBox(bbox) + "(node['building']['name'];node['amenity']['name'];node['historic']['name'];);out body;";
  query(q).then(function(data){
    console.log(data);
    var select = data[Math.floor(Math.random() * data.length)];
    var coords = {latitude:select.lat,longitude:select.lon};
    var meta = getMetadata(select);
    Objective(coords,meta,users);
  }).catch(console.error);
};

getHints = function(meta){

};
