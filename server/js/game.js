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

Objective = function(coords,meta,roster){
  var self = Point(coords);
  console.log(self.coords);
  self.meta = meta;
  console.log(self.meta);
  self.roster = roster;
  self.hints = {};
  self.clues = {};
  self.getClues = function(){
    console.log(self.id + ' getting clues...');
    var q = "[out:json];(node['building']['name'](around:800," + self.coords.latitude + "," + self.coords.longitude + ");node['amenity']['name'](around:800," + self.coords.latitude + "," + self.coords.longitude + ");node['historic']['name'](around:800," + self.coords.latitude + "," + self.coords.longitude + "););out body;";
    console.log(q);
    query(q).then(function(data){
      for(n = 0; n < 3; n++){
        var ran = Math.floor(Math.random() * data.length);
        var clue = data[ran];
        console.log(clue);
        var id = Math.random();
        var loc = {latitude:clue.lat,longitude:clue.lon};
        var meta = getMetadata(clue);
        self.clues[id] = Clue(loc,meta,id);
        data.splice(ran,1);
        console.log(data.length);
      }
    }).catch(console.error);
  };
  self.notif = function(msg){
    for(i in self.roster){
      var user = self.roster[i];
      user.emit('chat',{msg:msg});
    }
  };
  self.getClues();
  Objective.list[self.id] = self;
  console.log('new objective @ ' + self.coords.latitude + ',' + self.coords.longitude);
  for(i in self.meta){
    console.log(self.meta[i]);
  };
  return self;
};

Objective.list = {};

Clue = function(coords,meta,id){
  var self = Point(coords,id);
  self.meta = meta;
  self.hints = {};
  console.log('new clue @ ' + self.coords.latitude + ',' + self.coords.longitude);
  for(i in self.meta){
    console.log(self.meta[i]);
  };
  console.log('');
  return self;
};
