var express = require('express');
var http = require('http');
var path = require('path');
var app = express();
var server = http.createServer(app);

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(express.static(path.join(__dirname, 'public')));


// TODO: move routes to router modules
app.get('/', function(req, res, next) {
	res.render('index');
});
// TODO: chat room directory page
// TODO: private chat room feature
// TODO: chat log feature; only store 50 or so messages in the browser DOM for performance
app.get('/chatroom', function(req, res, next) {
	res.render('chatroom');
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