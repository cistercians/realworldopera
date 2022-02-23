var socket = io({transports: ['websocket'], upgrade: false});
var client = {name:null, num:null};

var enterDiv = document.getElementById('enterDiv');
var enterButton = document.getElementById('enter');
var home = document.getElementById('home');
var stream = document.getElementById('stream');
var time = document.getElementById('time');
var text = document.getElementById('text');

var audio = new Audio();
audio.src = '/client/Tosca.mp3';
audio.loop = true;

enterButton.onclick = function(){
  audio.play();
  enterDiv.style.display = 'none';
  home.style.display = 'inline';
  text.focus();
};

var getTime = function(){
  var d = new Date();
  var hours = d.getHours();
  var minutes = d.getMinutes();
  var seconds = d.getSeconds();
  if(hours < 10){
    hours = '0' + hours;
  }
  if(minutes < 10){
    minutes = '0' + minutes;
  }
  if(seconds < 10){
    seconds = '0' + seconds;
  }
  var timestring = '[' + hours + ':' + minutes + ':' + seconds + ']';
  return timestring;
}

var checkName = function(name){
  var n = calc(name);
  if(n == client.num){
    return name;
  } else {
    return 'anonymous';
  }
}

var submitText = function(){
  socket.emit('text', {name:client.name, msg:text.value});
  text.value = '';
}

text.addEventListener('keyup', function(event){
  if(event.keyCode == 13){
    submitText();
  }
});

socket.on('login',function(data){
  client.name = data;
  client.num = calc(data);
})

socket.on('chat', function(data){
  if(data.name){
    stream.innerHTML += "<div class='line'><p>" + getTime() + "</p><p class='name'>" + checkName(data.name) + ":&nbsp;</p><p>" + data.msg + "</p></div>"
  } else {
    stream.innerHTML += "<div class='line info'><p>" + getTime() + "</p><p class='name'>client:&nbsp;</p><p> " + data.msg + "</p></div>"
  }
});

setInterval(function(){
  time.innerHTML = getTime();
}, 1000);
