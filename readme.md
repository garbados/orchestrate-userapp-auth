# smashing-tut-auth

[UserApp.io]: https://www.userapp.io/
[Orchestrate]: http://orchestrate.io/

End-to-end authentication solution example using [UserApp.io][] and [Orchestrate][].

This project reflects the work of an upcoming blog series on authentication with Orchestrate and UserApp.

## Install

To get this demo to run, clone the repo and install dependencies like this:

    git clone [repo]
    cd orchestrate-userapp-auth
    npm install
    vi .env # set environment variables
    npm start

Then you can click around, log in, log out, etc. Most of the authentication code is in `routes/auth.js`, with some in `app.js`.

To build this authentication system from scratch, just follow along!

## DIY Auth

First, you'll need the Express project generator, which you can get through [npm][]:

    sudo npm install -g express-generator

Then, wherever you want to create your project, do this:

    express orchestrate-userapp-auth
    cd orchestrate-userapp-auth
    npm install
    npm start

Oh look! An Express application! The generator skeletons the project for us, so we can focus on adding authentication.

Adding authentication with [UserApp.io][] allows us to accept signups, manage features, permissions, and billing. Those systems can get complicated quickly, but this way our code stays simple.

### routes/auth.js

In `routes/auth.js` where most of our authentication code will go, we'll set up our authentication routes, and configure passport to authenticate users with UserApp.io. Let's start with the latter:

```javascript
var express = require('express');
var UserApp = require('userapp');
var orchestrate = require('orchestrate');
var kew = require('kew');
var db = orchestrate(process.env.ORCHESTRATE_APP_ID);
var passport = require('passport');
var UserAppStrategy = require('passport-userapp').Strategy;

// initialize UserApp
UserApp.initialize({ appId: process.env.USERAPP_APP_ID });

// passport session setup
// serialize user object to a string encoded in the cookie
// that their browser keeps to identify their session
passport.serializeUser(function (user, done) {
  done(null, user.id);
});

// deserialize the information encoded in an auth cookie
// into a user object
passport.deserializeUser(function (id, done) {
  // given a user id, retrieve that user
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
    // when a user successfully logs in,
    // upsert their userprofile to orchestrate
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
```

This provides us the underlying mechanisms for signing people in and out, and allowing their sessions to persist even if the server goes down.

But we need our users to actually, y'know, log in. Let's provide URL routes for that:

```javascript
var express = require('express');
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
```

This provides five routes:

* `GET /signup`: Presents a signup page.
* `GET /login`: Presents a login page.
* `POST /signup`: Submits the signup form; creates a user, and logs them in.
* `POST /login`: Submits the login form; logs the user in.
* `GET /logout`: Log out the current user, deleting their session cookie.

But, we haven't provided templates for our signup or login pages. This tutorial uses these [Jade][] files as templates:

```jade
//- signup.jade
extends layout

block content
  - if (message)
    p= message
  form(action='/signup', method='post')
    div
      label Username:
      input(type='text', name='login')
    div
      label Password:
      input(type='password', name='password')
    div
      label Confirm Password:
      input(type='password', name='confirm_password')
    div
      label Email:
      input(type='email', name='email')
    div
      input(type='submit', value='Submit')
```

```jade
//- login.jade
extends layout

block content
  - if (message)
    p= message
  form(action='/login', method='post')
    div
      label Username:
      input(type='text', name='username')
    div
      label Password:
      input(type='password', name='password')
    div
      input(type='submit', value='Submit')
```

Those are both pretty basic, but they get the job done. They end up looking like this:

*signup.jade*

TODO

*login.jade*

TODO

Now we just need to hook our authentication code into the Express app itself. We'll do that in `app.js`.

### app.js

We need to do three things to integrate our work:

1. Provide a secret string the app uses to encode session cookies.
2. Activate Passport middleware
3. Attach authentication's URL routes to the app

Because I'm exhausted, here's the raw file changes:

```javascript
var bodyParser = require('body-parser');
// past this line is added
var passport = require('passport');
var session = require('express-session');
var auth = require('./routes/auth').router;

...

app.use(cookieParser());
// past this line is added
app.use(session({ secret: process.env.APP_SECRET }));
app.use(passport.initialize());
app.use(passport.session());
app.use(function (req, res, next) {
  if (req.user) res.locals.user = req.user;
  next();
});


app.use('/', auth);
// above this line is added
app.use('/', routes);
app.use('/users', users);
```

Then, run `npm start` and you have auth!

## License

[ASLv2](http://www.apache.org/licenses/LICENSE-2.0)
