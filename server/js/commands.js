const { supabase } = require('../config/supabase');
const logger = require('../config/logger');
const config = require('../config');

EvalCmd = async function(data){
  const socket = SOCKET_LIST[data.id];
  
  // Register command - DISABLED, redirect to login
  if(data.cmd === 'register' || (data.cmd.slice(0,8) === 'register' && data.cmd[8] === ' ')){
    socket.emit('chat', {msg:'registration disabled - use /login [username] instead'});
  
  } else if(data.cmd === 'login'){
    socket.emit('chat', {msg:'/login [username] - no password needed'});
  } else if(data.cmd.slice(0,5) === 'login' && data.cmd[5] === ' '){
    const args = data.cmd.slice(data.cmd.indexOf(' ') + 1);
    const username = args.trim().toLowerCase();
    
    if(!username || username.length < 1){
      socket.emit('chat', {msg:'usage: /login [username]'});
      return;
    }
    
    // Validate username
    if(username.length < 3){
      socket.emit('notif', {msg:'username must be at least 3 characters'});
      return;
    }
    
    if(username.length > 30){
      socket.emit('notif', {msg:'username must be less than 30 characters'});
      return;
    }
    
    if(!/^[a-z0-9_-]+$/.test(username)){
      socket.emit('notif', {msg:'username can only contain letters, numbers, _ and -'});
      return;
    }
    
    // Check if already logged in
    if(USERS[username]){
      socket.emit('notif', {msg:'user is already logged in'});
      return;
    }
    
    try {
      // Simple login - no authentication required
      USERS[username] = data.id;
      SOCKET_LIST[data.id].name = username;
      SOCKET_LIST[data.id].userId = `user-${username}-${Date.now()}`; // Fake userId for compatibility
      
      // Calculate gematria if enabled
      let gematriaValue = 0;
      if(config.enableGematriaValidation){
        gematriaValue = calc(username);
      }
      
      socket.emit('login', username);
      socket.emit('chat', {msg:`✓ logged in as ${sp_user(username)}`});
      socket.emit('chat', {msg:'<span class="greyout">/orbit to toggle rotation</span>'});
      socket.emit('chat', {msg:'<span class="greyout">#projectname to create/open project</span>'});
      
      if(config.enableGematriaValidation){
        socket.emit('chat', {msg:`your gematria value: ${gematriaValue}`});
      }
      
      logger.info('User logged in', { username });
      
    } catch(error){
      logger.error('Login exception', { error: error.message });
      socket.emit('notif', {msg:'login failed - server error'});
    }
  } else if(data.cmd === 'logout'){
    if(socket.name){
      const username = socket.name;
      socket.emit('chat', {msg:'logging out...'});
      delete USERS[socket.name];
      socket.name = null;
      socket.userId = null;
      socket.token = null;
      logger.info('User logged out', { username });
      socket.emit('logout');
    } else {
      socket.emit('chat', {msg:'you are not logged in'});
    }
  } else if(data.cmd === 'loc' || data.cmd === 'location'){
    socket.emit('locate');
  } else if(data.cmd === 'calculate' || data.cmd === 'calc'){
    socket.emit('chat', {msg:'/calc [phrase]'});
  } else if((data.cmd.slice(0,4) === 'calc' && data.cmd[4] === ' ') || (data.cmd.slice(0,9) === 'calculate' && data.cmd[9] === ' ')){
    const phrase = data.cmd.slice(data.cmd.indexOf(' ') + 1).toLowerCase();
    if(charCheck(phrase)){
      const num = calc(phrase).toString();
      socket.emit('chat', {msg: phrase + ' = ' + num});
    } else {
      socket.emit('chat', {msg: 'phrase can only contain characters a-z'});
    }
  } else if(data.cmd === 'who'){
    socket.emit('chat', {msg:'/who @[user]'});
  } else if(data.cmd.slice(0,3) === 'who' && data.cmd[3] === ' '){
    const username = data.cmd.slice(data.cmd.indexOf(' ') + 1).toLowerCase();
    let user = null;
    for(const i in USERS){
      const name = SOCKET_LIST[USERS[i]].name;
      if(name === username){
        user = SOCKET_LIST[USERS[i]];
      }
    }
    if(user){
      // TODO: send info about user from Supabase profile
      socket.emit('chat', {msg:`user ${sp_user(username)} found`});
    } else {
      socket.emit('chat', {msg:'cannot find user'});
    }
  } else if(data.cmd === 'orbit'){
    socket.emit('orbit');
  } else if(data.cmd === 'center'){
    socket.emit('center');
  }
  
  // Research commands
  else if(data.cmd === 'research'){
    socket.emit('chat', {msg:'research commands: /research start|stop|status'});
  } else if(data.cmd.startsWith('research start')){
    require('./research').startResearch(socket);
  } else if(data.cmd === 'research stop'){
    require('./research').stopResearch(socket);
  } else if(data.cmd === 'research status'){
    require('./research').researchStatus(socket);
  } else if(data.cmd === 'review'){
    require('./research').showReviewQueue(socket);
  } else if(data.cmd.startsWith('approve') || data.cmd.startsWith('accept')){
    require('./research').approveFinding(socket, data.cmd);
  } else if(data.cmd.startsWith('reject') || data.cmd.startsWith('dismiss')){
    require('./research').rejectFinding(socket, data.cmd);
  }
};
