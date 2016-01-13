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
app.set('port', (process.env.PORT || 3000));

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
mongoose.connect(process.env.MONGOLAB_URI || 'mongodb://localhost/test');
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
var notificationSchema = new Schema({
	type: String,
	chatroomId: ObjectId,
	chatroomName: String,
	sender: String
});
var chatroomSchema = new Schema({
	name: String,
	admin: String, // admin user is by default the creator of the chatroom
	members: [String],
	messageLog: [pageSchema],
	capacity: Number,
	isPublic: Boolean, // if true, anyone can see this chatroom in their directory
	needPermission: Boolean // if true, user who wants to join must have permissino from admin
});
var Chatroom = mongoose.model('Chatroom', chatroomSchema);
var userSchema = new Schema({
	firstname: String,
	lastname: String,
	username: String,
	password: String,
	email: String,
	chatrooms: [{
		id: ObjectId,
		approved: Boolean // if false, user is still awaiting approval from chatroom's admin
	}],
	notifications: [notificationSchema]
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

// exported for routes JS files
module.exports = {
	User: User,
	Chatroom: Chatroom,
	createTimestamp: createTimestamp
};


io.on('connection', function(socket) {
	socket.on('directory', function(username) {
		socket.join(username);
	});
	socket.on('notification', function(username) {
		io.to(username).emit('notification');
	});
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

var auth = require('./routes/authentication');
var chatroom = require('./routes/chatroom');
var directory = require('./routes/directory');
var notifications = require('./routes/notifications');

// make sure session user is valid
app.use(function(req, res, next) {
	if (req.session.user) {
		User.findOne({username: req.session.user.username}, function(err, user) {
			if (user) {
				delete req.session.user.password; // don't keep password in cookie
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
// autocomplete feature via jQuery UI: autocomplete users' usernames
// used to find users to invite to a chatroom
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
		}
	});
});
app.use('/', auth);
// make sure pages that need login are not accessed by unauthenticated users
function authenticate(req, res, next) {
	if (!req.session.user) {
		res.redirect('/');
		return;
	} else {
		next();
	}
}
app.use(authenticate);
app.use('/dir', directory);
app.use('/chat', chatroom);
app.use('/notifications', notifications);

// for any unknown route
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

server.listen(app.get('port'), function() {
	console.log('Listening on port ' + app.get('port'));
});