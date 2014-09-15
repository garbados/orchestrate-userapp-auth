var express = require('express');
var UserApp = require('userapp');
var orchestrate = require('orchestrate');
var kew = require('kew');
var db = orchestrate(process.env.ORCHESTRATE_APP_ID);

var passport = require('passport');
var UserAppStrategy = require('passport-userapp').Strategy;

// Don't for get to init UserApp
UserApp.initialize({ appId: process.env.USERAPP_APP_ID });

// passport session setup
passport.serializeUser(function (user, done) {
  done(null, user.id);
});

passport.deserializeUser(function (id, done) {
  db.get('users', id)
  .then(function (user) {
    done(null, user);
  })
  .fail(function (err) {
    done(err.body);
  });
});

// passport strategy setup
passport.use(new UserAppStrategy({
    appId: process.env.USERAPP_APP_ID
  },
  function (userprofile, done) {
    // upsert user profile from orchestrate
    if (!userprofile) {
      return done(new Error('A user by that name does not exist'));
    }

    db.put('users', userprofile.id, userprofile)
    .then(function () {
      done(null, userprofile)
    })
    .fail(function (err) {
      done(err.body);
    });
  }
));

// 
// AUTH ROUTES
// 

var session = require('express-session');
var router = express.Router();

router.get('/signup', function (req, res) {
  res.render('signup');
});

router.post('/signup', 
  // create the user in UserApp
  function (req, res, next) {
    // the HTML form names are conveniently named the same as
    // the UserApp fields...
    var user = req.body;

    // verify passwords match
    if (req.password !== req.confirm_password)
      return res.render('signup', {user: false, message: 'Passwords did not match.'});

    kew.nfcall(UserApp.User.save, user)
    .then(function (user) {
      return db.put('users', user.user_id, user);
    })
    .then(function () {
      req.body.username = req.body.login;
      next();
    })
    .fail(function (err) {
      res.render('signup', { 
        user: false, message: (err.body || err).message
      });
    });
  },
  passport.authenticate('userapp', { failureRedirect: '/signup', failureFlash: 'Error logging in user' }),
  function (req, res) {
    res.redirect('/');
  }
);

router.get('/login', function (req, res) {
  res.render('login');
});

router.post('/login', 
  passport.authenticate('userapp', { failureRedirect: '/login' }),
  function (req, res) {
    res.cookie('ua_session_token', req.user.token);
    res.redirect('/');
  });

router.get('/logout', function (req, res) {
  req.logout();
  res.clearCookie('ua_session_token');
  res.redirect('/');
});

// helper middleware
function ensureAuthenticated (req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/login');
}

// expose to rest of app
exports.router = router;
exports.passport = passport;
exports.ensureAuthenticated = ensureAuthenticated;
