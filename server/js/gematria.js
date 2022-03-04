Table = {
  ' ':0,
  'a':6,
  'b':12,
  'c':18,
  'd':24,
  'e':30,
  'f':36,
  'g':42,
  'h':48,
  'i':54,
  'j':60,
  'k':66,
  'l':72,
  'm':78,
  'n':84,
  'o':90,
  'p':96,
  'q':102,
  'r':108,
  's':114,
  't':120,
  'u':126,
  'v':132,
  'w':138,
  'x':144,
  'y':150,
  'z':156
}

calc = function(phrase){
  var sum = 0;
  for(i in phrase){
    sum += Table[phrase[i]];
  }
  return sum;
};
