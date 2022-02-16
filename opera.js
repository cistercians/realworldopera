var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);

app.get('/',function(req, res) {
  res.sendFile(__dirname + '/client/index.html');
});
app.use('/client',express.static(__dirname + '/client'));

SOCKET_LIST = {};

io.sockets.on('connection', function(socket){
  socket.id = Math.random();
  SOCKET_LIST[socket.id] = socket;
  console.log('Socket connected: ' + socket.id);

  socket.on('disconnect',function(){
    delete SOCKET_LIST[socket.id];
    console.log('Socket disconnected: ' + socket.id);
  })
});

http.listen(2000, function() {
  console.log("Server is listening on port 2000");
});
