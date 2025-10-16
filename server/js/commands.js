const { supabase } = require('../config/supabase');
const logger = require('../config/logger');
const config = require('../config');

EvalCmd = async function(data){
  const socket = SOCKET_LIST[data.id];
  
  // Register command
  if(data.cmd === 'register'){
    socket.emit('chat', {msg:'/register [username] [password]'});
  } else if(data.cmd.slice(0,8) === 'register' && data.cmd[8] === ' '){
    const args = data.cmd.slice(data.cmd.indexOf(' ') + 1);
    const parts = args.split(' ');
    
    if(parts.length < 2){
      socket.emit('chat', {msg:'usage: /register [username] [password]'});
      return;
    }
    
    const username = parts[0].toLowerCase();
    const password = parts.slice(1).join(' '); // Allow spaces in password
    
    // Validate username
    if(username.length < 3 || username.length > 30){
      socket.emit('notif', {msg:'username must be 3-30 characters'});
      return;
    }
    
    if(!/^[a-z0-9_-]+$/.test(username)){
      socket.emit('notif', {msg:'username can only contain letters, numbers, _ and -'});
      return;
    }
    
    // Validate password
    if(password.length < 6){
      socket.emit('notif', {msg:'password must be at least 6 characters'});
      return;
    }
    
    try {
      // Register with Supabase Auth
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: `${username}@realworldopera.app`, // Use fake email since we don't collect real emails
        password: password,
        options: {
          data: {
            username: username,
          }
        }
      });
      
      if(signUpError){
        logger.error('Registration error', { error: signUpError.message, username });
        socket.emit('notif', {msg:`registration failed: ${signUpError.message}`});
        return;
      }
      
      if(!authData.user){
        socket.emit('notif', {msg:'registration failed - no user returned'});
        return;
      }
      
      // Calculate gematria value if enabled
      let gematriaValue = 0;
      if(config.enableGematriaValidation){
        gematriaValue = calc(username);
      }
      
      // Update profile with gematria value
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ gematria_value: gematriaValue })
        .eq('id', authData.user.id);
      
      if(profileError){
        logger.warn('Profile update warning', { error: profileError.message });
      }
      
      logger.info('User registered', { username, userId: authData.user.id });
      
      socket.emit('chat', {msg:`✓ registered as ${sp_user(username)}`});
      socket.emit('chat', {msg:'now use: /login ' + username + ' [password]'});
      
      if(config.enableGematriaValidation){
        socket.emit('chat', {msg:`your gematria value: ${gematriaValue}`});
      }
      
    } catch(error){
      logger.error('Registration exception', { error: error.message });
      socket.emit('notif', {msg:'registration failed - server error'});
    }
    
  } else if(data.cmd === 'login'){
    socket.emit('chat', {msg:'/login [username] [password]'});
  } else if(data.cmd.slice(0,5) === 'login' && data.cmd[5] === ' '){
    const args = data.cmd.slice(data.cmd.indexOf(' ') + 1);
    const parts = args.split(' ');
    
    if(parts.length < 2){
      socket.emit('chat', {msg:'usage: /login [username] [password]'});
      return;
    }
    
    const username = parts[0].toLowerCase();
    const password = parts.slice(1).join(' ');
    
    // Check if already logged in
    if(USERS[username]){
      socket.emit('notif', {msg:'user is already logged in'});
      return;
    }
    
    try {
      // Login with Supabase Auth
      const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
        email: `${username}@realworldopera.app`,
        password: password,
      });
      
      if(signInError){
        logger.warn('Login failed', { error: signInError.message, username });
        socket.emit('notif', {msg:'login failed - invalid credentials'});
        return;
      }
      
      if(!authData.user || !authData.session){
        socket.emit('notif', {msg:'login failed - no session'});
        return;
      }
      
      // Get profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authData.user.id)
        .single();
      
      // Update last login
      await supabase
        .from('profiles')
        .update({ last_login: new Date().toISOString() })
        .eq('id', authData.user.id);
      
      // Store user session
      USERS[username] = data.id;
      SOCKET_LIST[data.id].name = username;
      SOCKET_LIST[data.id].userId = authData.user.id;
      SOCKET_LIST[data.id].token = authData.session.access_token;
      
      socket.emit('login', username);
      socket.emit('chat', {msg:`✓ logged in as ${sp_user(username)}`});
      socket.emit('chat', {msg:'<span class="greyout">/orbit to toggle rotation</span>'});
      socket.emit('chat', {msg:'<span class="greyout">#projectname to create/open project</span>'});
      
      if(config.enableGematriaValidation && profile?.gematria_value){
        socket.emit('chat', {msg:`your gematria value: ${profile.gematria_value}`});
      }
      
      logger.info('User logged in', { username, userId: authData.user.id });
      
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
};
