var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var mongojs = require('mongojs');
var db = mongojs('localhost:27017/rwo',['accounts']);

require('./server/js/commands');

app.get('/',function(req, res) {
  res.sendFile(__dirname + '/client/index.html');
});
app.use('/client',express.static(__dirname + '/client'));

SOCKET_LIST = {};

isValidPass = function(data,cb){
  db.accounts.find({name:data.name,pass:data.pass},function(err,res){
    if(res.length > 0){
      cb(true);
    } else {
      cb(false);
    }
  })
}

charCheck = function(name){
  for(i in name){
    if(Table[name[i]]){
      continue;
    } else {
      return false;
    }
  }
  return true;
};

isNameTaken = function(data,cb){
  db.accounts.find(data,function(err,res){
    if(res.length > 0){
      cb(true);
    } else {
      cb(false);
    }
  })
};

addUser = function(data,cb){
  db.accounts.insert({name:data.name, pass:data.pass},function(err){
    cb();
  })
};

io.sockets.on('connection', function(socket){
  socket.id = Math.random();
  SOCKET_LIST[socket.id] = socket;
  console.log('Socket connected: ' + socket.id);
  socket.emit('chat', {msg:'welcome to the real world opera'});
  socket.emit('chat', {msg:'/login or /signup'});

  socket.on('disconnect',function(){
    delete SOCKET_LIST[socket.id];
    console.log('Socket disconnected: ' + socket.id);
  })

  socket.on('text',function(data){
    if(data.msg[0] == '/'){
      var cmd = data.msg.split('/');
      console.log(cmd);
      EvalCmd({id:socket.id, cmd:cmd[1]});
    } else {
      io.emit('chat', data);
    }
  })
});

http.listen(2000, function() {
  console.log("Server is listening on port 2000");
});
