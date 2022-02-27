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
  } else if(data.cmd.slice(0,6) == 'login' && data.cmd[6] == ' '){
    var c = data.cmd.slice(data.cmd.indexOf(' ') + 1);
    var cred = c.split(' ');
    if(cred.length == 2){
      if(charCheck(cred[0])){
        isNameTaken(cred[0],function(res){
          if(res){
            socket.emit('chat', {msg: 'that name is taken'})
          } else {
            addUser({name:cred[0], pass:cred[1]});
            socket.emit('login', cred[0]);
            socket.emit('chat', {msg:'you have signed up as ' + cred[0]})
          }
        })
      } else {
        socket.emit('chat', {msg: 'name can only contain characters a-z'});
      }
    } else {
      socket.emit('chat', {msg:'invalid credentials'});
    }
  }
}
