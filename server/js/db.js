var mongojs = require('mongojs');
var db = mongojs('0.0.0.0:27017/rwo',['accounts']);

isValidPass = function(data,cb){
  db.accounts.find({name:data.name,pass:data.pass},function(err,res){
    if(res.length > 0){
      cb(true);
    } else {
      cb(false);
    }
  })
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
