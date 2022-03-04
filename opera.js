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
