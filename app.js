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
// var ObjectId = Schema.ObjectId;
var pageSchema = new Schema({
	messages: [String]
});
var chatroomSchema = new Schema({
	name: String,
	members: [String],
	messageLog: [pageSchema],
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
// app.use(function(req, res, next) {
// 	if (req.session.user) {
// 		User.findOne({username: req.session.user.username}, function(err, user) {
// 			if (user) {
// 				delete req.session.user.password;
// 				req.session.user = user;
// 			} else {
// 				//invalid session user
// 				req.session.reset();
// 			}
// 			next();
// 		});
// 	} else {
// 		next();
// 	}
// });

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
app.post('/login', function(req, res, next) {
	var login_info = req.body;
	User.findOne({username: login_info.username}, function(err, user) {
		if (err) {
			next(err);
		} else if (!user || login_info.password != user.password) {
			// TODO: put query parameters in body and away from url
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
// app.get('/logout', function(req, res, next) {
// 	req.session.reset();
// 	res.redirect('/');
// })
app.post('/logout', function(req, res, next) {
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


// TODO: private chat room feature
// TODO: chat log feature; only store 50 or so messages in the browser DOM for performance
// TODO: new joiner of chat room can load previous messages
// TODO: create groups of users/friends?
app.get('/chatroom', function(req, res, next) {	
	Chatroom.findById(req.query.id, function(err, chatroom) {
		if (err || !chatroom) {
			next(err);
		} else if (chatroom.members.indexOf(req.session.user.username) == -1) {
			res.redirect('/contactdir');
			return;
		} else {
			res.render('chatroom', {
				name: chatroom.name,
				members: chatroom.members,
				curMessages: chatroom.messageLog[chatroom.messageLog.length - 1].messages
			});
		}
	});
});
// chatroom directory page
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
					memberRooms[memberOfChatrooms[i]._id] = true;
				}
				for (i = 0; i < rooms.length; i += 1) {
					if (!(rooms[i]._id in memberRooms)) {
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
// creating a new chatroom
app.route('/newroom')
	.get(authenticate, function(req, res, next) {
		res.render('newroom');
	})
	.post(authenticate, function(req, res, next) {
		var chatroom_info = req.body;
		if (chatroom_info.members && typeof chatroom_info.members == 'string') {
			chatroom_info.members = [chatroom_info.members];
		}
		// create chatroom document from form POST data
		Chatroom.create({
			name: chatroom_info.chatroomname,
			members: [],
			messageLog: [{messages: []}],
			capacity: Number(chatroom_info.capacity),
			isPublic: (chatroom_info.privacy == 'Public') ? true : false,
			needPermission: (chatroom_info.permission == 'Yes') ? true : false 
		}, function(err, chatroom) {
			if (err) {
				next(err);
			} else {
				// find all members via regex, remembering to include the logged-in user
				chatroom_info.members.push(req.session.user.username);
				var regex = new RegExp('^' + chatroom_info.members.join('$|^') + '$');
				User.find({username: regex}, function(err, users) {
					if (err) {
						next(err);
					} else {
						// TODO: users only become members of a chatroom once they accept
						// the invitation

						// update chatroom doc's members attribute with users' ids
						chatroom.members = users.map(function(user) {
							return user.username;
						});
						chatroom.save(function(err, chatroom) {
							if (err) {
								next(err);
							} else {
								// add chatroom doc to each member's list of chatrooms
								users.forEach(function(user) {
									user.chatrooms.push(chatroom);
									user.save(function(err) {
										if (err) {
											next(err);
										}
									});
								});
								res.redirect('/chatroom?id=' + chatroom._id);
								return;
							}
						});
					}
				});
			}
		});
	});
// autocomplete feature via jQuery UI: autocomplete users' usernames
// when choosing users to invite on creation page for chatroom
app.get('/autocomplete', function(req, res, next) {
	var regex = new RegExp('^' + req.query.term, 'i');
	User.find({username: regex}, function(err, users) {
		if (err) {
			next(err);
		} else if (users) {
			res.send(users.map(function(user) {
				return user.username;
			}));
			return;
		} else {
			res.send([]);
			return;
		}
	});
})

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