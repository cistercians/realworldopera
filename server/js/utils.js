const NodeGeocoder = require('node-geocoder');
const config = require('../config');
const logger = require('../config/logger');
const dist = require('get-distance-between-points');

const options = {
  provider: 'mapbox',
  apiKey: config.mapboxToken,
  // Prefer landmarks, POIs, and addresses
  // https://docs.mapbox.com/api/search/geocoding/
};
const geocoder = NodeGeocoder(options);

// Wrapper to get better geocoding results using multiple providers
async function smartGeocode(address) {
  try {
    logger.info('🔍 Starting geocode', { address });
    
    const fetch = require('node-fetch');
    
    // Try OpenStreetMap Nominatim first (better for landmarks/POIs)
    // https://nominatim.org/release-docs/develop/api/Search/
    const osmAddress = encodeURIComponent(address);
    const osmUrl = `https://nominatim.openstreetmap.org/search?q=${osmAddress}&format=json&limit=10&addressdetails=1`;
    
    logger.info('📡 Calling OSM Nominatim API', { url: osmUrl });
    
    const osmResponse = await fetch(osmUrl, {
      headers: {
        'User-Agent': 'RealWorldOpera/1.0 (geospatial research tool)'
      }
    });
    const osmData = await osmResponse.json();
    
    logger.info('✅ OSM Nominatim response', { status: osmResponse.status, results: osmData.length });
    
    if (!osmData || osmData.length === 0) {
      logger.warn('Geocoding found no results', { query: address });
      return null;
    }
    
    // Log all results for debugging
    logger.info('Geocoding results', { 
      query: address, 
      count: osmData.length,
      top3: osmData.slice(0, 3).map(r => ({
        name: r.display_name,
        type: r.type,
        class: r.class,
        importance: r.importance
      }))
    });
    
    // Prefer tourism/amenity POIs (landmarks, buildings) over generic places
    // OSM types: tourism=*, amenity=*, building=*, place=*, highway=*
    const poiResult = osmData.find(r => 
      r.class === 'tourism' || 
      r.class === 'amenity' ||
      (r.class === 'building' && r.type !== 'yes') ||
      r.type === 'attraction'
    );
    
    // If no POI, prefer results with higher importance that aren't just roads
    const bestResult = poiResult || osmData.filter(r => 
      r.class !== 'highway' && r.class !== 'boundary'
    ).sort((a, b) => 
      parseFloat(b.importance || 0) - parseFloat(a.importance || 0)
    )[0] || osmData[0];
    
    logger.info('🎯 Selected result', { 
      name: bestResult.display_name,
      type: bestResult.type,
      class: bestResult.class,
      isPOI: !!poiResult,
      importance: bestResult.importance
    });
    
    // Convert OSM format to node-geocoder format
    const lat = parseFloat(bestResult.lat);
    const lng = parseFloat(bestResult.lon);
    const addr = bestResult.address || {};
    
    const result = {
      latitude: lat,
      longitude: lng,
      formattedAddress: bestResult.display_name,
      city: addr.city || addr.town || addr.village,
      state: addr.state,
      zipcode: addr.postcode,
      country: addr.country,
      district: addr.county,
      neighbourhood: addr.neighbourhood || addr.suburb,
      extra: {
        bbox: bestResult.boundingbox,
        osm_type: bestResult.osm_type,
        osm_id: bestResult.osm_id,
        class: bestResult.class,
        type: bestResult.type,
        importance: bestResult.importance
      }
    };
    
    logger.info('✨ Final geocode result', { 
      address: result.formattedAddress,
      coords: `${lat}, ${lng}`,
      city: result.city,
      type: `${bestResult.class}:${bestResult.type}`
    });
    
    return result;
    
  } catch (error) {
    logger.error('❌ Geocoding error', { error: error.message, stack: error.stack, address });
    return null;
  }
}
query = require('@derhuerst/query-overpass');

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
  return await smartGeocode(addr);
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
