var express = require('express');
var router = express.Router();
var app = require('../app.js');
var User = app.User;
var Chatroom = app.Chatroom;

// chatroom directory page
router.get('/contactdir', function(req, res, next) {
	Chatroom.find({isPublic: true}, function(err, rooms) {
		if (err) {
			next(err);
		} else {
			var userRooms = {};
			var userChatrooms = req.session.user.chatrooms;
			var memberOfChatrooms = []; // rooms this user is a member of
			var memberPendingChatrooms = []; // rooms this user is awaiting membership
			var otherRooms = []; // other public rooms
			if (rooms) {
				// eliminate duplicates between all public rooms and rooms that this user
				// is a member of
				userChatrooms.forEach(function(room) {
					userRooms[room.id] = true;
				});
				rooms.forEach(function(room) {
					if (!(room._id in userRooms)) {
						otherRooms.push(room);
					}
				}); 
			}
			if (userChatrooms.length == 0) {
				res.render('contactdir', {
					user: req.session.user.username,
					memberOf: memberOfChatrooms,
					memberPending: memberPendingChatrooms,
					publicRooms: otherRooms,
					numNotifications: req.session.user.notifications.length
				});
				return;
			} else {
				// find the chatroom docs for each chatroom id in memberOfchatroomIds
				function findChatroom(index) {
					var roomInfo = userChatrooms[index];
					Chatroom.findById(roomInfo.id, function(err, chatroom) {
						if (err) {
							next(err);
						} else if (!chatroom) { // chatroom has been deleted
							// remove the obsolete chatroom from the user's chatroom list
							userChatrooms.splice(index, 1);
							req.session.user.save(function(err) {
								if (err) next(err);
							});
						} else {
							if (roomInfo.approved) {
								memberOfChatrooms.push(chatroom);
							} else {
								memberPendingChatrooms.push(chatroom);
							}
							if (memberOfChatrooms.length + memberPendingChatrooms.length 
								== userChatrooms.length) {
								// we have found all chatroom docs
								res.render('contactdir', {
									user: req.session.user.username,
									memberOf: memberOfChatrooms,
									memberPending: memberPendingChatrooms,
									publicRooms: otherRooms,
									numNotifications: req.session.user.notifications.length
								});							
							}
						}
					});
				}
				for (var i = 0; i < userChatrooms.length; i++) {
					findChatroom(i);
				}				
			}
		}
	});
});
// leave a chatroom from the directory
router.post('/leavechatroom', function(req, res, next) {
	var toRemove = req.body;
	Chatroom.findById(toRemove.id, function(err, chatroom) {
		if (err || !chatroom) {
			next(err);
		} else if (!chatroom) {
			res.send('Bad request');
			return;
		} else {
			var index = chatroom.members.indexOf(req.session.user.username);
			if (index == -1 || req.session.user.username != toRemove.user) {
				// session user doesn't match request's user or user is not in
				// chatroom to leave
				res.send('Bad request');
				return;
			} else {
				chatroom.members.splice(index, 1); // remove user from chatroom's members
				var userChatroomIds = req.session.user.chatrooms;
				for (var i = 0; i < userChatroomIds.length; i += 1) {
					if (String(userChatroomIds[i].id) == String(chatroom._id)) {
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
					if (req.session.user.username == chatroom.admin) {
						// if the admin has left, assign the role of admin to another chatroom member
						chatroom.admin = chatroom.members[0];
					}
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
router.post('/joinchatroom', function(req, res, next) {
	var toJoin = req.body;
	Chatroom.findById(toJoin.id, function(err, chatroom) {
		if (err) {
			next(err);
		} else if (!chatroom || req.session.user.username != toJoin.user 
			|| chatroom.members.indexOf(req.session.user.username) != -1) {
			// session user and request's user don't match or user is already in the
			// chatroom to join
			res.send({
				msg: 'Bad request',
				redirect: false
			});
			return;
		} else {
			var notifications = req.session.user.notifications;
			var existingNotification;
			for (var i = 0; i < notifications.length; i++) {
				var notification = notifications[i];
				if (String(notification.chatroomId) == String(chatroom._id)) {
					existingNotification = notification;
					break;
				}
			}
			if (existingNotification) {
				res.send({
					msg: 'Already invited',
					redirect: false
				});
				return;
			} else if (chatroom.needPermission) { // need admin's permission to join
				User.findOne({username: chatroom.admin}, function(err, admin) {
					if (err) next(err);
					else {
						// send request to admin
						admin.notifications.push({
							type: 'request',
							chatroomId: chatroom._id,
							chatroomName: chatroom.name,
							sender: req.session.user.username
						});
						admin.save(function(err) {
							if (err) {
								next(err);
							}
						});
						// add chatroom to user's chatrooms list as not approved yet
						req.session.user.chatrooms.push({
							id: chatroom._id,
							approved: false
						});
						req.session.user.save(function(err) {
							if (err) {
								next(err);
							}
						});
						res.send({
							msg: 'Request sent',
							redirect: false
						});
					}
				});
			} else if (chatroom.members.length == chatroom.capacity) {
				res.send({
					msg: 'Chatroom has been filled',
					redirect: false
				});
			} else {
				chatroom.members.push(req.session.user.username); // add user as member
				// add chatroom to user's chatrooms list as approved
				req.session.user.chatrooms.push({
					id: chatroom._id,
					approved: true
				});
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
						msg: String(chatroom._id),
						redirect: true
					});
				});
			}
		} 
	});
});
// creating a new chatroom
router.route('/newroom')
	.get(function(req, res, next) {
		res.render('newroom');
	})
	.post(function(req, res, next) {
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
			admin: req.session.user.username,
			members: [req.session.user.username],
			messageLog: [],
			capacity: Number(chatroomInfo.capacity),
			isPublic: (chatroomInfo.privacy == 'Public') ? true : false,
			needPermission: (chatroomInfo.permission == 'Yes') ? true : false 
		}, function(err, chatroom) {
			if (err) {
				next(err);
			} else {
				// find all invited members via regex
				var regex = new RegExp('^' + chatroomInfo.members.join('$|^') + '$');
				User.find({username: regex}, function(err, users) {
					if (err) {
						next(err);
					} else {
						// send invitation to all desired members
						var invite = {
							type: 'invite',
							chatroomId: chatroom._id,
							chatroomName: chatroom.name,
							sender: req.session.user.username
						}
						users.forEach(function(user) {
							if (user.username != req.session.user.username) {
								// make sure the session user doesn't invite him/herself
								user.notifications.push(invite);
								user.save(function(err) {
									if (err) {
										next(err);
									}
								});
							}
						});
					}
				});
				req.session.user.chatrooms.push({
					id: chatroom._id,
					approved: true
				});
				req.session.user.save(function(err) {
					if (err) {
						next(err);
					} else {
						res.redirect('/chat/chatroom?id=' + chatroom._id);
					}
				});
			}
		});
	});

module.exports = router;