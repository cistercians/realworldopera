PROJECTS = {};

var new_project = function(id,key){
  var socket = SOCKET_LIST[id];
  var project = PROJECTS[key] = {
    locked:false,
    userlist:[socket.name],
    log:[],
    data:{},
    ent:[],
    org:[],
    loc:[]
  };
  socket.emit('chat',{msg:'new project ' + sp_project(key) + ' created'});
  EvalKey({id:id,key:key});
}

EvalKey = function(data){
  var socket = SOCKET_LIST[data.id];
  var key = data.key;
  if(PROJECTS[key]){
    if(PROJECTS[key].locked){
      var access = false;
      for(var i in PROJECTS[key].userlist){
        if(PROJECTS[key].userlist[i] == socket.name){
          access = true;
        }
      }
      if(access){
        socket.emit('chat',{msg:'opening project ' + sp_project(key)});
        socket.emit('project',{project:PROJECTS[key]});
        SOCKET_LIST[data.id].key = key;
      } else {
        socket.emit('notif',{msg:'access to project ' + sp_project(key) + ' denied'});
      }
    } else {
      socket.emit('chat',{msg:'opening project ' + sp_project(key)});
      socket.emit('project',{project:PROJECTS[key]});
      SOCKET_LIST[data.id].key = key;
    }
  } else {
    new_project(socket.id,key);
    SOCKET_LIST[socket.id].key = key;
    var entry = {
      date:new Date(),
      loc:socket.loc,
      name:socket.name,
      body:'project created by @' + socket.name
    }
    PROJECTS[key].log.push(entry);
    entry = {
      date:new Date(),
      loc:socket.loc,
      name:socket.name,
      body:'project opened by @' + socket.name
    }
    PROJECTS[key].log.push(entry);
  }
}

EvalAdd = async function(input){
  var socket = SOCKET_LIST[input.id];
  var str = input.item.split(' ');
  if(str[0] == 'loc'){
    var addr = input.item.split('loc ')[1];
    var data = await getCoords(addr);
    console.log(data);
    var name = data.formattedAddress.split(',')[0];
    var loc = {};
    if(data.extra.bbox){
      var w = data.extra.bbox[0];
      var s = data.extra.bbox[1];
      var e = data.extra.bbox[2];
      var n = data.extra.bbox[3];
      loc = {
        name:name.toLowerCase(),
        description:null,
        bbox:[[w,n],[e,n],[e,s],[w,s]],
        address:data.formattedAddress,
        links:[],
        notes:[]
      }
    } else {
      loc = {
        name:name.toLowerCase(),
        description:null,
        coords:{longitude:data.longitude,latitude:data.latitude},
        address:data.formattedAddress,
        links:[],
        notes:[]
      }
    }
    if(data.neighbourhood){
      loc.neighbourhood = data.neighbourhood;
    }
    if(data.city){
      loc.city = data.city;
    }
    if(data.district){
      loc.district = data.district;
    }
    if(data.zipcode){
      loc.zipcode = data.zipcode;
    }
    if(data.state){
      loc.state = data.state;
    }
    if(data.country){
      loc.country = data.country;
    }
    var id = Math.random();
    PROJECTS[socket.key].data[id] = loc;
    PROJECTS[socket.key].loc.push(id);
    var entry = {
      date:new Date(),
      loc:socket.loc,
      name:socket.name,
      body:'loc !' + loc.name + ' added by @' + socket.name
    }
    PROJECTS[socket.key].log.push(entry);
    socket.emit('chat',{msg:'loc ' + sp_item(loc.name) + ' added to ' + sp_project(socket.key)})
    socket.emit('project',{project:PROJECTS[socket.key]});
  } else if(str[0] == 'coords'){
    var coords = input.item.split('coords ')[1];
    var latlng = coords.split(',');
    var lat = parseFloat(latlng[0]);
    var lng = parseFloat(latlng[1]);
    var data = await hasAddress(lat,lng);
    console.log(data);
  }
}

EvalItem = function(input){
  var socket = SOCKET_LIST[input.id];
  var project = PROJECTS[socket.key];
  if(input.item.includes(' +')){
    var str = input.item.split(' +');
    var id = '';
    var item = str[0];
    var data = str[1].split(' ');
    for(var i in project.data){
      if(project.data[i].name == item){
        id = i;
      }
    }
    if(data[0] == 'desc'){
      var desc = str[1].split('desc ')[1];
      PROJECTS[socket.key].data[i].description = desc;
      socket.emit('chat',{msg:'description added to ' + sp_item(item)});
      socket.emit('project',{project:PROJECTS[socket.key]});
    }
  } else {
    var items = [];
    for(var i in project.data){
      if(project.data[i].name == input.item.toLowerCase() || project.data[i].name.includes(input.item.toLowerCase())){
        items.push(project.data[i]);
      }
    }
    if(items.length == 0){
      socket.emit('chat',{msg:'<span class="greyout">item not found</span>'});
    } else if(items.length == 1){
      var item = items[0];
      var out = sp_item(item.name) + ':<br>';
      if(item.description){
        out += '<i>' + item.description + '</i><br>';
      } else {
        out += '<span class="greyout"><i>!' + item.name + ' +desc [description...]</i></span><br>';
      }
      if(project.loc.includes(i)){
        out += 'address: ' + item.address + '<br>';
      }
      if(item.links.length > 0){

      } else {

      }
      out += '<------------------------------------>';
      socket.emit('chat',{msg:out});
    } else {
      var out = 'items found:';
      for(var i in items){
        out += '<br>' + sp_item(items[i].name);
      }
      socket.emit('chat',{msg:out});
    }
  }
}
