EvalCmd = function(data){
  var socket = SOCKET_LIST[data.id];
  // login
  if(data.cmd == 'login'){
    socket.emit('chat', {msg:'/login username password'});
  } else if(data.cmd.slice(0,5) == 'login' && data.cmd[5] == ' '){
    var c = data.cmd.slice(data.cmd.indexOf(' ') + 1);
    var cred = c.split(' ');
    if(cred.length == 2){
      isValidPass({name:cred[0], pass:cred[1]},function(res){
        if(res){
          SOCKET_LIST[data.id].name = cred[0];
          socket.emit('login', cred[0]);
        } else {
          socket.emit('chat',{msg:'invalid credentials'});
        }
      })
    } else {
      socket.emit('chat', {msg:'invalid credentials'});
    }
  } else if(data.cmd == 'signup'){
    socket.emit('chat', {msg:'/signup username password'});
  } else if(data.cmd.slice(0,6) == 'signup' && data.cmd[6] == ' '){
    var c = data.cmd.slice(data.cmd.indexOf(' ') + 1);
    var cred = c.split(' ');
    if(cred.length == 2){
      var name = cred[0].toLowerCase();
      if(charCheck(name)){
        isNameTaken(name,function(res){
          if(res){
            socket.emit('chat', {msg: 'that name is taken'})
          } else {
            addUser({name:name, pass:cred[1]});
            SOCKET_LIST[data.id].name = name;
            socket.emit('login', name);
            socket.emit('chat', {msg:'you have signed up as ' + name})
          }
        })
      } else {
        socket.emit('chat', {msg: 'name can only contain characters a-z'});
      }
    } else {
      socket.emit('chat', {msg:'invalid credentials'});
    }
  } else if(data.cmd == 'location'){
    getLoc();
  } else if(data.cmd == 'calc'){
    socket.emit('chat', {msg:'/calc phrase'});
  } else if(data.cmd.slice(0,4) == 'calc' && data.cmd[4] == ' '){
    console.log('calc');
    var phrase = data.cmd.slice(data.cmd.indexOf(' ') + 1);
    var num = calc(phrase).toString();
    socket.emit('chat', {msg: phrase + ' = ' + num});
  } else if(data.cmd == 'hint'){
    //
  }
};
