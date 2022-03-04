var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
require('./server/js/db');
require('./server/js/commands');
require('./server/js/gematria');
require('./server/js/game');
require('./server/js/utils');
var Fakerator = require("fakerator");
var fakerator = Fakerator();

app.get('/',function(req, res) {
  res.sendFile(__dirname + '/client/index.html');
});
app.use('/client',express.static(__dirname + '/client'));

SOCKET_LIST = {};

charCheck = function(name){
  for(i in name){
    if(Table[name[i]] && name[i] !== ' '){
      continue;
    } else {
      return false;
    }
  }
  return true;
};

io.sockets.on('connection', function(socket){
  socket.id = Math.random();
  SOCKET_LIST[socket.id] = socket;
  console.log('Socket connected: ' + socket.id);
  socket.emit('chat', {msg:'welcome to the real world opera'});
  socket.emit('chat', {msg:'/login or /signup'});

  socket.on('disconnect', function(){
    delete SOCKET_LIST[socket.id];
    console.log('Socket disconnected: ' + socket.id);
  })

  socket.on('loc', function(data){
    SOCKET_LIST[socket.id].loc = data;
  })

  socket.on('text', function(data){
    if(data.msg[0] == '/'){
      var cmd = data.msg.split('/');
      EvalCmd({id:socket.id, cmd:cmd[1]});
    } else {
      if(data.name){
        io.emit('chat', data);
      } else {
        socket.emit('chat', {msg:'/login or /signup to chat'});
      }
    }
  })
});

http.listen(2000, function() {
  console.log("Server is listening on port 2000");
});

setTimeout(function(){
  var loc = SOCKET_LIST[randomUser()].loc.coords;
  for(i = 0; i < 100; i++){
    var id = Math.random();
    var shift = 1;
    if(Math.random() < 0.5){
      shift = -1;
    }
    var lat = loc.latitude + (Math.random() * 0.1 * shift);
    if(Math.random() < 0.5){
      shift = -1;
    } else {
      shift = 1;
    }
    var lng = loc.longitude + (Math.random() * 0.1 * shift);
    SOCKET_LIST[id] = {
      id:id,
      name:'test',
      loc:{
        coords:{latitude:lat,longitude:lng}
      }
    }
  }
  buildClusters();
  newObjective();
},15000);
