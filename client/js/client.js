var enterDiv = document.getElementById('enterDiv');
var enterButton = document.getElementById('enter');
var home = document.getElementById('home');

var audio = new Audio();
audio.src = '/client/Tosca.mp3';
audio.loop = true;

enterButton.onclick = function(){
  audio.play();
  enterDiv.style.display = 'none';
  home.style.display = 'inline';
};
