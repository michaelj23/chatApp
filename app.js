var express = require('express');
var http = require('http');
var path = require('path');
var bodyParser = require('body-parser');
var app = express();
var server = http.createServer(app);
var io = require('socket.io')(server);

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: true}));

var mongoose = require('mongoose');
mongoose.connect('mongodb://localhost/test');
var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error'));
db.once('open', function() {
	console.log('database connected');
	var Schema = mongoose.Schema;
	var userSchema = new Schema({
		firstname: String,
		lastname: String,
		username: String,
		password: String,
		email: String
	});
	var User = mongoose.model('User', userSchema);
});


io.on('connection', function(socket) {
	socket.on('message', function(message) {
		//TODO: emit message to only people in the chat room from which you got the message
		io.emit('message', message);
	});
});


// TODO: move routes to router modules
app.get('/', function(req, res, next) {
	res.render('index');
});
app.route('/signup')
	.get(function(req, res, next) {
		res.render('signup');
	})
	.post(function(req, res, next) {
		var account_info = req.body;
		for (var key in account_info) {
			if (account_info.hasOwnProperty(key)) {
				if (account_info[key] == '') {
					res.render('signup', {error: 'One or more fields were left blank.'});
					return; //NEED this return
				}
			}
		}
		res.redirect('/contactdir');
	});


// TODO: chat room directory page
// TODO: private chat room feature
// TODO: chat log feature; only store 50 or so messages in the browser DOM for performance
// TODO: new joiner of chat room can load previous messages
app.get('/chatroom', function(req, res, next) {
	res.render('chatroom');
});
app.get('/contactdir', function(req, res, next) {
	res.render('contactdir');
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