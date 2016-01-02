var express = require('express');
var http = require('http');
var path = require('path');
var bodyParser = require('body-parser');
var session = require('client-sessions');
var app = express();
var server = http.createServer(app);
var io = require('socket.io')(server);

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));
app.use(session({
	cookieName: 'session',
	secret: 'kajs2fxZXCveEea35fkGqqqqOApsDkf',
	duration: 30 * 60 * 1000,
	activeDuration: 5 * 60 * 1000,
	httpOnly: true,
	ephemeral: true
}));

var mongoose = require('mongoose');
mongoose.connect('mongodb://localhost/test');
var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error'));
db.once('open', function() {
	console.log('database connected');
});
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;
var chatroomSchema = new Schema({
	name: String,
	members: [ObjectId],
	messageLog: [String],
	capacity: Number,
	isPublic: Boolean,
	needPermission: Boolean
});
var Chatroom = mongoose.model('Chatroom', chatroomSchema);
var userSchema = new Schema({
	firstname: String,
	lastname: String,
	username: String,
	password: String,
	email: String,
	chatrooms: [chatroomSchema]
});
var User = mongoose.model('User', userSchema);


io.on('connection', function(socket) {
	socket.on('message', function(message) {
		//TODO: emit message to only people in the chat room from which you got the message
		io.emit('message', message);
	});
});

// make sure session user is valid
app.use(function(req, res, next) {
	if (req.session.user) {
		User.findOne({username: req.session.user.username}, function(err, user) {
			if (user) {
				delete req.session.user.password;
				req.session.user = user;
			} else {
				//invalid session user
				req.session.reset();
			}
			next();
		});
	} else {
		next();
	}
});

// make sure pages that need login are not accessed by unauthenticated users
function authenticate(req, res, next) {
	if (!req.session.user) {
		res.redirect('/');
		return;
	} else {
		next();
	}
}



// TODO: move routes to router modules
app.get('/', function(req, res, next) {
	if (req.session.user) {
		res.redirect('/contactdir');
		return;
	} else {
		res.render('index');
	}
});
app.get('/login', function(req, res, next) {
	var login_info = req.query;
	User.findOne({username: login_info.username}, function(err, user) {
		if (err) {
			next(err);
		} else if (!user || login_info.password != user.password) {
			delete req.query.password;
			res.render('index', {error: 'Username or password is incorrect.'});
			return;
		} else {
			req.session.user = user;
			delete req.session.user.password;
			res.redirect('/contactdir');
			return;
		}
	});
});
app.get('/logout', function(req, res, next) {
	req.session.reset();
	res.redirect('/');
});
app.route('/signup')
	.get(function(req, res, next) {
		if (req.session.user) {
			//TODO: render chatroom dir
			res.redirect('/contactdir');
		} else {
			res.render('signup');
		}
	})
	.post(function(req, res, next) {
		var account_info = req.body;
		// check for blank fields
		for (var key in account_info) {
			if (account_info.hasOwnProperty(key)) {
				if (account_info[key] == '') {
					res.render('signup', {error: 'One or more fields were left blank.'});
					return; //need this return
				} 
			}
		}
		// check whether username is taken
		User.findOne({username: account_info.username}, function(err, user) {
			if (err) {
				next(err);
			} else if (user) {
				// found one
				res.render('signup', {error: 'This username is already taken.'});
				return;
			} else {
				// if no user found, create a new user
				User.create({
					firstname: account_info.firstname,
					lastname: account_info.lastname,
					username: account_info.username,
					password: account_info.password,
					email: account_info.email
				}, function(err, user) {
					if (err) {
						next(err);
					} else {
						req.session.user = user;
						delete req.session.user.password;
						res.redirect('/contactdir');
						return;
					}
				});
			}
		});
	});


// TODO: chat room directory page
// TODO: private chat room feature
// TODO: chat log feature; only store 50 or so messages in the browser DOM for performance
// TODO: new joiner of chat room can load previous messages
app.get('/chatroom', authenticate, function(req, res, next) {
	res.render('chatroom');
});
app.get('/contactdir', authenticate, function(req, res, next) {
	Chatroom.find({isPublic: true}, function(err, rooms) {
		if (err) {
			next(err);
		} else {
			var memberRooms = {};
			var otherRooms = [];
			var memberOfChatrooms = req.session.user.chatrooms;
			if (rooms) {
				// eliminate duplicates between all public rooms and rooms that this user
				// is a member of
				for (var i = 0; i < memberOfChatrooms.length; i += 1) {
					memberRooms[memberOfChatrooms.id] = true;
				}
				for (i = 0; i < rooms.length; i += 1) {
					if (!(rooms[i].id in memberRooms)) {
						otherRooms.push(rooms[i]);
					}
				}
			}

			res.render('contactdir', {
				user: req.session.user.username,
				memberOf: memberOfChatrooms,
				publicRooms: otherRooms
			});
			return;
		}
	});
});
app.get('/newroom', authenticate, function(req, res, next) {
	res.render('newroom');
});



app.use(function(req, res, next) {
	var err = new Error('Not Found');
	err.status = 404;
	next(err);
});
// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use(function(err, req, res, next) {
  	console.error(err.stack);
    res.status(err.status || 500);
    res.render('error', {
      message: err.message,
      error: err
    });
  });
}
// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.render('error', {
    message: err.message,
    error: {}
  });
});

server.listen(3000, function() {
	console.log('Listening on port ' + server.address().port);
})