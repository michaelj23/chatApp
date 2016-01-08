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
// A chatroom's message log is composed of pages, which are arrays of messages.
// Each page has a certain capacity of messages designating the maximum capacity of 
// messages the browser will hold.
var pageSchema = new Schema({
	messages: [{
		text: String,
		username: String,
		timestamp: String
	}]
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
	chatrooms: [ObjectId]
});
var User = mongoose.model('User', userSchema);

function createTimestamp() {
	var d = new Date();
	var hour = d.getHours();
	var minutes = d.getMinutes();
	if (minutes < 10) minutes = '0' + minutes;
	var label = (hour > 11) ? 'PM' : 'AM';
	if (hour % 12 == 0) hour = 12;
	else hour = hour % 12;
	return hour + ':' + minutes + ' ' + label;
}


io.on('connection', function(socket) {
	socket.on('join chatroom', function(roomData) {
		socket.room = roomData.chatroomId;
		socket.username = roomData.username;
		socket.join(roomData.chatroomId);
		io.to(roomData.chatroomId).emit('announcement', roomData.username + ' connected');
	});
	socket.on('disconnect', function() {
		io.to(socket.room).emit('announcement', socket.username + ' disconnected');
	});
	socket.on('message', function(message) {
		if (socket.room) { // user must have officially joined the chatroom
			message.timestamp = createTimestamp();
			io.to(socket.room).emit('message', message);
		}
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
app.post('/login', function(req, res, next) {
	var loginInfo = req.body;
	User.findOne({username: loginInfo.username}, function(err, user) {
		if (err) {
			next(err);
		} else if (!user || loginInfo.password != user.password) {
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
app.post('/logout', function(req, res, next) {
	req.session.reset();
	res.redirect('/');
});
app.route('/signup')
	.get(function(req, res, next) {
		if (req.session.user) {
			res.redirect('/contactdir');
		} else {
			res.render('signup');
		}
	})
	.post(function(req, res, next) {
		var accountInfo = req.body;
		// check for blank fields
		for (var key in accountInfo) {
			if (accountInfo.hasOwnProperty(key)) {
				if (accountInfo[key] == '') {
					res.render('signup', {error: 'One or more fields were left blank.'});
					return; //need this return
				} 
			}
		}
		// check whether username is taken
		User.findOne({username: accountInfo.username}, function(err, user) {
			if (err) {
				next(err);
			} else if (user) {
				// found one
				res.render('signup', {error: 'This username is already taken.'});
				return;
			} else {
				// if no user found, create a new user
				User.create({
					firstname: accountInfo.firstname,
					lastname: accountInfo.lastname,
					username: accountInfo.username,
					password: accountInfo.password,
					email: accountInfo.email,
					chatrooms: []
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


// TODO: new joiner of chat room can load previous messages
// TODO: create groups of users/friends
app.route('/chatroom')
	.get(authenticate, function(req, res, next) {	
		Chatroom.findById(req.query.id, function(err, chatroom) {
			if (err || !chatroom) {
				next(err);
			} else if (chatroom.members.indexOf(req.session.user.username) == -1) {
				res.redirect('/contactdir');
				return;
			} else {
				var curmsg;
				if (chatroom.messageLog.length > 0) {
					curmsg = chatroom.messageLog[chatroom.messageLog.length - 1].messages;
				} else {
					curmsg = [];
				}
				res.render('chatroom', {
					name: chatroom.name,
					id: chatroom._id,
					user: req.session.user.username,
					members: chatroom.members,
					curMessages: curmsg,
					numMessages: curmsg.length
				});
			}
		});
	})
	// save an emitted message
	.post(authenticate, function(req, res, next) {
		var newMessage = req.body;
		Chatroom.findById(newMessage.id, function(err, chatroom) {
			if (err || !chatroom) {
				next(err);
			} else if (chatroom.members.indexOf(req.session.user.username) == -1
				|| req.session.user.username != newMessage.user) {
				// make sure request's user is in the chatroom and sent the msg
				res.redirect('/contactdir');
				return;
			} else {
				if (newMessage.newPage == 'true' || chatroom.messageLog.length == 0) {
					// need new page
					chatroom.messageLog.push({
						messages: []
					});
				}
				var curPage = chatroom.messageLog[chatroom.messageLog.length - 1];
				curPage.messages.push({
					text: newMessage.text,
					username: newMessage.user,
					timestamp: createTimestamp(),
				});
				chatroom.save(function(err) {
					if (err) {
						next(err);
					}
				});
				res.end();
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
			var memberOfChatroomIds = req.session.user.chatrooms;
			var memberOfChatrooms = [];
			if (rooms) {
				// eliminate duplicates between all public rooms and rooms that this user
				// is a member of
				for (var i = 0; i < memberOfChatroomIds.length; i += 1) {
					memberRooms[memberOfChatroomIds] = true;
				}
				for (i = 0; i < rooms.length; i += 1) {
					if (!(rooms[i]._id in memberRooms)) {
						otherRooms.push(rooms[i]);
					}
				}
			}
			if (memberOfChatroomIds.length == 0) {
				res.render('contactdir', {
					user: req.session.user.username,
					memberOf: memberOfChatrooms,
					publicRooms: otherRooms
				});
				return;
			} else {
				// find the chatroom docs for each chatroom id in memberOfchatroomIds
				for (i = 0; i < memberOfChatroomIds.length; i += 1) {
					Chatroom.findById(memberOfChatroomIds[i], function(err, chatroom) {
						memberOfChatrooms.push(chatroom);
						if (memberOfChatrooms.length == memberOfChatroomIds.length) {
							// we have found all chatroom docs
							res.render('contactdir', {
								user: req.session.user.username,
								memberOf: memberOfChatrooms,
								publicRooms: otherRooms
							});
							return;
						}
					});
				}				
			}
		}
	});
});
// leave a chatroom from the directory
app.post('/leavechatroom', authenticate, function(req, res, next) {
	var toRemove = req.body;
	Chatroom.findById(toRemove.id, function(err, chatroom) {
		if (err || !chatroom) {
			next(err);
		} else {
			var index = chatroom.members.indexOf(req.session.user.username);
			if (index == -1 || req.session.user.username != toRemove.user) {
				// session user doesn't match request's user or user is not in
				// chatroom to leave
				res.send('failure');
				return;
			} else {
				chatroom.members.splice(index, 1); // remove user from chatroom's members
				var userChatroomIds = req.session.user.chatrooms;
				for (var i = 0; i < userChatroomIds.length; i += 1) {
					if (String(userChatroomIds[i]) == String(chatroom._id)) {
						userChatroomIds.splice(i, 1); // remove chatroom from user's chatrooms
						break;
					}
				}
				if (chatroom.members.length == 0) {
					// if chatroom is empty, just delete it
					chatroom.remove(function(err) {
						if (err) {
							next(err);
						}
					});
				} else {
					chatroom.save(function(err) {
						if (err) {
							next(err);
						}
					});
				}
				req.session.user.save(function(err) {
					if (err) {
						next(err);
					}
				});
				res.send('success');
			}
		}
	});
});
// become a member of a chatroom from the directory
app.post('/joinchatroom', authenticate, function(req, res, next) {
	var toJoin = req.body;
	Chatroom.findById(toJoin.id, function(err, chatroom) {
		if (err || !chatroom) {
			next(err);
		} else if (req.session.user.username != toJoin.user 
			|| chatroom.members.indexOf(req.session.user.username) != -1) {
			// session user and request's user don't match or user is already in the
			// chatroom to join
			res.redirect('/contactdir');
			return;
		} else {
			// TODO: chatrooms that require permission to join: don't redirect to them
			chatroom.members.push(req.session.user.username); // add user as member
			req.session.user.chatrooms.push(chatroom._id); // add chatroom id to user's chatrooms id list
			req.session.user.save(function(err) {
				if (err) {
					next(err);
				}
			});
			chatroom.save(function(err) {
				if (err) {
					next(err);
				}
				res.send({
					id: String(chatroom._id)
				});
			});
		}
	});
})
// creating a new chatroom
app.route('/newroom')
	.get(authenticate, function(req, res, next) {
		res.render('newroom');
	})
	.post(authenticate, function(req, res, next) {
		var chatroomInfo = req.body;
		if (!chatroomInfo.members) {
			chatroomInfo.members = [];
		} else if (typeof chatroomInfo.members == 'string') {
			chatroomInfo.members = [chatroomInfo.members];
		}
		if (chatroomInfo.members.length + 1 > Number(chatroomInfo.capacity)) {
			res.render('newroom', {error: 'Number of members will exceed chatroom capacity.'})
			return;
		}
		// create chatroom document from form POST data
		Chatroom.create({
			name: chatroomInfo.chatroomname,
			members: [],
			messageLog: [],
			capacity: Number(chatroomInfo.capacity),
			isPublic: (chatroomInfo.privacy == 'Public') ? true : false,
			needPermission: (chatroomInfo.permission == 'Yes') ? true : false 
		}, function(err, chatroom) {
			if (err) {
				next(err);
			} else {
				// find all members via regex, remembering to include the logged-in user
				chatroomInfo.members.push(req.session.user.username);
				var regex = new RegExp('^' + chatroomInfo.members.join('$|^') + '$');
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
									user.chatrooms.push(chatroom._id);
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