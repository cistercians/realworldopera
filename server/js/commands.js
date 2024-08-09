EvalCmd = function(data){
  var socket = SOCKET_LIST[data.id];
  // login
  if(data.cmd == 'login'){
    socket.emit('chat', {msg:'/login [username]'});
  } else if(data.cmd.slice(0,5) == 'login' && data.cmd[5] == ' '){
    var c = data.cmd.slice(data.cmd.indexOf(' ') + 1);
    var cred = c.split(' ');
    if(cred.length == 1){
      if(USERS[cred]){
        socket.emit('chat',{msg: 'user is already logged in'});
      } else {
        if(!socket.loc){
          socket.emit('chat', {msg: '/location not found'});
          socket.emit('notif', {msg: 'location services disabled on chrome browsers'});
        }
        USERS[cred[0]] = data.id;
        SOCKET_LIST[data.id].name = cred[0];
        socket.emit('login', cred[0]);
        socket.emit('chat',{msg: 'you are logged in as ' + sp_user(cred)});
        console.log('User logged in: ' + cred);
      }
    }
  } else if(data.cmd == 'logout'){
    if(socket.name){
      socket.emit('chat',{msg: 'logging out...'});
      delete USERS[socket.name];
      socket.name = null;
      console.log('User logged out: ' + socket.name);
      socket.emit('logout');
    } else {
      socket.emit('chat',{msg: 'you are not logged in'});
    }
  } else if(data.cmd == 'loc' || data.cmd == 'location'){
    socket.emit('locate');
  } else if(data.cmd == 'calculate' || data.cmd == 'calc'){
    socket.emit('chat', {msg:'/calc [phrase]'});
  } else if((data.cmd.slice(0,4) == 'calc' && data.cmd[4] == ' ') || (data.cmd.slice(0,9) == 'calculate' && data.cmd[9] == ' ')){
    var phrase = data.cmd.slice(data.cmd.indexOf(' ') + 1).toLowerCase();
    if(charCheck(phrase)){
      var num = calc(phrase).toString();
      socket.emit('chat', {msg: phrase + ' = ' + num});
    } else {
      socket.emit('chat', {msg: 'phrase can only contain characters a-z'});
    }
  } else if(data.cmd == 'who'){
    socket.emit('chat',{msg: '/who @[user]'});
  } else if(data.cmd.slice(0,3) == 'who' && data.cmd[3] == ' '){
    var username = data.cmd.slice(data.cmd.indexOf(' ') + 1).toLowerCase();
    var user = null;
    for(var i in USERS){
      var name = SOCKET_LIST[USERS[i]].name;
      if(name == username){
        user = SOCKET_LIST[USERS[i]];
      }
    }
    if(user){
      // send info about user
    } else {
      socket.emit('chat',{msg: 'cannot find user'});
    }
  } else if(data.cmd == 'orbit'){
    socket.emit('orbit');
  } else if(data.cmd == 'center'){
    socket.emit('center');
  }
};
