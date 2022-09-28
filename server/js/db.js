const uri = process.env.MONGODB_URI;
const MongoClient = require("mongodb").MongoClient;
const client = new MongoClient(uri,{useUnifiedTopology:true});
client.connect();
const db = client.db('realworldopera');

isValidPass = async function(data,cb){
  db.collection('accounts').find(data).toArray(function(err,res){
    if(err){
      throw err;
    }
    if(res.length > 0){
      cb(true);
    } else {
      cb(false);
    }
  })
};

isNameTaken = async function(data,cb){
  await db.collection('accounts').find(data).toArray(function(err,res){
    if(err){
      throw err;
    }
    if(res.length > 0){
      cb(true);
    } else {
      cb(false);
    }
  })
};

addUser = async function(data){
  await db.collection('accounts').insertOne({name:data.name,pass:data.pass}).then(function(err){
  }).catch(console.error);
};

keyLookup = async function(data,cb){
  await db.collection('keys').find(data.key).toArray(function(err,res){
    if(err){
      throw err;
    }
    if(res.length > 0){
      cb(true);
    } else {
      db.collection('keys').insertOne({key:data.key,admin:data.name}).then(function(err){
      }).catch(console.error);
      cb(false);
    }
  })
};
