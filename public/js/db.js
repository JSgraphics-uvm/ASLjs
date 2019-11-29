// Your web app's Firebase configuration
var firebaseConfig = {
  apiKey: "AIzaSyA_mvkf8l2jZTkKY0ErMoexy7zSufPrfyA",
  authDomain: "aslgame-af0ce.firebaseapp.com",
  databaseURL: "https://aslgame-af0ce.firebaseio.com",
  projectId: "aslgame-af0ce",
  storageBucket: "aslgame-af0ce.appspot.com",
  messagingSenderId: "334959286416",
  appId: "1:334959286416:web:3005a516891177ede6e015",
  measurementId: "G-796KT0PEZD"
};
// Initialize Firebase
firebase.initializeApp(firebaseConfig);
firebase.analytics();

var username = getUrlVars()["username"];
var ref = firebase.database().ref("userdata/" + username);

var this_user = {
  dbReady: 0,
  my_key: "10",
  username: "",
  stage: 0,
  game_level: 0,
  restart_time: 0,
  number_of_success_level_0: 0,
  number_of_fail_level_0: 0,
  number_of_success_level_1: 0,
  number_of_fail_level_1: 0,
  number_of_success_level_2: 0,
  number_of_fail_level_2: 0,
  number_of_success_level_3: 0,
  number_of_fail_level_3: 0,
  time_in_stage_0: 0,
  time_in_stage_1: 0,
  time_in_stage_2: 0,
  need_help: 0,
  updateTime: 0
};

ref.once("value").then(function(body) {
  let user = body.val();
  if (user === null) {
    user = this_user;
  }
  if (user.my_key == this_user.my_key) {
    this_user = user;
  }
  this_user.dbReady = 1;
  _update_datebase();
  game_start = 1;
});

function _update_datebase() {
  if (undefined === this_user.dbReady || this_user.dbReady) {
    this_user.dbReady = 1;
    this_user["updateTime"] = Date.now();
    ref.set(this_user);
  }
}

function updateDatabase(key, value) {
  this_user[key] = value;
  _update_datebase();
}

function incDatabase(key, inc = 1) {
  this_user[key] += inc;
  _update_datebase();
}

function getUrlVars() {
  var vars = {};
  var parts = window.location.href.replace(/[?&]+([^=&]+)=([^&]*)/gi, function(
    m,
    key,
    value
  ) {
    vars[key] = value;
  });
  return vars;
}

var last_time = Date.now();
var dbReady = false;
function writeDataEverySec(sec = 1) {
  if (Date.now() - last_time > sec * 1000) {
    //console.log(sec + "s pass");
    incDatabase("time_in_stage_" + this_user.stage, sec);
    last_time = Date.now();
  }
}
