#!/usr/bin/env node

var express = require('express')
  , FMStore = require('./')(express)
  , app = express()
  ;

var myStore = new FMStore({parentFolder: __dirname+'/mySessions', permission: '0755'});

//Sample middleware to create the folder and provide the folder name in req.session.folder
function setFolder(req, res, next) {
    logger.trace('setFolder', req.sessionID);
    mySessionStore.checkP({sid: req.sessionID, user: req.user}).then(function(dirName) {
        req.session.folder = dirName;
        next(); 
    }, function(e) { res.json(500, e); });
};

app.use(express.cookieParser());
app.use(express.session({
    cookie: conf.sessions.cookie
    , secret: conf.sessions.secret
    , store: mySessionStore
}));

app.use(app.router);

app.get('/mySessionFolder', setFolder, function(req, res) {
    // req.session.folder should point to this user's session folder
    res.send(req.session.folder);
} );

app.listen(8080);