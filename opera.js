var express = require('express');
var app = express();
var http = require('http').Server(app);
port = process.env.PORT || 80;
var io = require('socket.io')(http,{
  transports:['websocket'],
  pingInterval:300000,
  pingTimeout:300000,
  upgradeTimeout:150000
});
require('./server/js/commands');
require('./server/js/gematria');
require('./server/js/utils');
require('./server/js/projects');

app.get('/',function(req, res) {
  res.sendFile(__dirname + '/client/index.html');
});
app.use('/client',express.static(__dirname + '/client'));

SOCKET_LIST = {};
USERS = {};

io.sockets.on('connection', function(socket){
  socket.id = Math.random();
  SOCKET_LIST[socket.id] = socket;
  console.log('Socket connected: ' + socket.id);
  socket.emit('chat', {msg:'welcome to the real world opera'});
  socket.emit('chat', {msg:'alpha launched 3/3/2022'});
  socket.emit('chat', {msg:'/login to start'});

  socket.on('disconnect', function(reason){
    if(socket.name){
      delete USERS[socket.name];
      console.log('User logged out: ' + socket.name);
    }
    delete SOCKET_LIST[socket.id];
    console.log('Socket disconnected: ' + socket.id + ' (' + reason + ')');
  })

  socket.on('loc', function(data){
    SOCKET_LIST[socket.id].loc = data;
  })

  socket.on('text', function(data){
    if(data.msg[0] == '/'){
      var cmd = data.msg.split('/');
      EvalCmd({id:socket.id, cmd:cmd[1]});
    } else if(data.msg[0] == '#'){
      var key = data.msg.split('#');
      EvalKey({id:socket.id, key:key[1]});
    } else if(data.msg[0] == '+'){
      if(socket.key){
        var item = data.msg.split('+');
        EvalAdd({id:socket.id, item:item[1]});
      } else {
        socket.emit('notif',{msg:'no #project open'});
      }
    } else if(data.msg[0] == '!'){
      if(socket.key){
        var item = data.msg.split('!');
        EvalItem({id:socket.id, item:item[1]});
      } else {
        socket.emit('notif',{msg:'no #project open'});
      }
    } else {
      if(data.name){
        io.emit('chat', data);
      } else {
        socket.emit('chat', {msg:'/login to chat'});
      }
    }
  })
});

http.listen(port, function() {
  console.log("Server is listening on port 80");
});
