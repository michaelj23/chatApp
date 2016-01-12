var express = require('express');
var router = express.Router();
var app = require('../app.js');
var User = app.User;
var Chatroom = app.Chatroom;

router.get('/', function(req, res, next) {
	if (req.session.user) {
		res.redirect('/dir/contactdir');
		return;
	} else {
		res.render('index');
	}
});
router.post('/login', function(req, res, next) {
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
			res.redirect('/dir/contactdir');
			return;
		}
	});
});
router.post('/logout', function(req, res, next) {
	req.session.reset();
	res.redirect('/');
});
router.route('/signup')
	.get(function(req, res, next) {
		if (req.session.user) {
			res.redirect('/dir/contactdir');
			return;
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
					return; // need this return
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
					chatrooms: [],
					notifications: []
				}, function(err, user) {
					if (err) {
						next(err);
					} else {
						req.session.user = user;
						delete req.session.user.password;
						res.redirect('/dir/contactdir');
					}
				});
			}
		});
	});

module.exports = router;