/*jshint smarttabs:true, evil:true, undef:false, node:true, wsh:true, eqnull:true, expr:true, curly:true, trailing:true , unused:true, laxcomma:true*/
"use strict";

/**
   Module dependencies.
 */
var path = require('path'),
    util = require('util'),
    fs = require('fs'),
    wrench = require('wrench'),
    crypto = require('crypto'),
    Store = require('connect').middleware.session.Store;


/**
   Initialize FileSessionStore with given `opts`.

   @param {Object} opts Options.
   @api public
 */
var FileSessionStore = module.exports = function FileSessionStore(opts) {
    opts = opts || {};
    Store.call(this, opts);

    // define default session store directory
    this.prefix = opts.prefix || 'session-info';
    this.path = process.env.TMPDIR;
    // ensure specified path exists (create if neccesary)
    if( opts.path) {
        if (fs.existsSync(opts.path) || fs.mkdirSync(opts.path)) {
            this.path = opts.path;
        }
    }
    this.useAsync = opts.useAsync;
    this.printDebug = opts.printDebug;
    
    this.count = 0;
    
    // set default reapInterval to 10 minutes
    this.reapInterval = opts.reapInterval || 600000;
    
    // interval for reaping stale sessions
    if (this.reapInterval !== -1) {
        setInterval(function (self) {
            self.reap();
        }, this.reapInterval, this);
    }
};

util.inherits(FileSessionStore, Store);

/**
   Reap expired sessions.

   @api private
 */
FileSessionStore.prototype.reap = function () {
    var now = new Date()
        , self = this // store 'this' object
        , val
        , printDebug = this.printDebug
        , expires
        ;
    
    // TODO AV : check the files we are reading match the prefix and are not directories
     if( printDebug ) {
        util.log('reaper running');
    }
   
    fs.readdir( self.path, function(err, files){

        if( files.length <= 0 ) { return; }
        
        files.forEach(function(d) {

            var dirPath = path.join(self.path, d)
                , filePath = path.join(dirPath, self.prefix)
                ;

            if( !fs.existsSync(filePath) ) {
                util.error('reap '+filePath+' does not exist');
                return;
            }

            fs.readFile( filePath, function (err, data) {
                if(err || data.length<=0) {
                    util.error('reap readFile err:'+ err+data);
                    return;
                }

                val = JSON.parse(data);
                expires = new Date(val.cookie.expires);
                if (expires < now) {
                    if( printDebug ) { util.debug('reap '+d+' expired deleting ' + dirPath ); }
                    wrench.rmdirSyncRecursive( dirPath , function(err) {
                        if (err) { util.error('reap rmdir err:'+ err); }
                    });
                } else {
                    util.debug('reap session still valid:'+ expires + ' is > ' + now);
                }
            });
        });
    });
};

FileSessionStore.prototype.getPath = function(sid) {
    return crypto.createHash('md5').update(sid).digest('hex');
};
FileSessionStore.prototype.list = function(sid, fn) {
    var self = this
        , dirPath = path.join( this.path, this.getPath(sid) )
        , i
        ;
    if (fn) {
        fs.readdir( dirPath, function(err, files) {
            if (err) { return fn(err); }

            i = files.indexOf(self.prefix);
            if (i>-1) { files.splice(i, 1); }
            return fn(null, files);
        });
    } else {
        var files = fs.readdirSync( dirPath );
        i = files.indexOf(self.prefix);
        if (i>-1) { files.splice(i, 1); }
        return files;
    }
};

/**
   Attemp to fetch session by the given `sid`.

   @param {String} sid Session ID.
   @param {Function} fn Function, that called after get.
   @api public
 */
FileSessionStore.prototype.get = function(sid, fn) {
    var serial = this.count++; //Math.round(Math.random()*1000);
    var dirName = this.getPath(sid);
    var filePath = path.join( this.path, dirName, this.prefix );
    var printDebug = this.printDebug;
    fn = fn || function () {};
 
    if( !this.useAsync ){
        if( fs.existsSync(filePath) ){
            var data = fs.readFileSync( filePath );
            if( printDebug ) {
                util.log(serial + ' get sync OK [' + filePath + ']' + data + '.' );
            }
            fn( null, JSON.parse(data) );
        }else{
            if( printDebug ) {
                util.error(serial + ' get sync FAIL [' + filePath + '] - no data found');
            }
            fn();
        }
        return;
    }
    
    if( printDebug ) { util.log(serial + ' get [' + filePath + ']'); }
    fs.exists( filePath, function (exists) {
        if( exists ){
            fs.readFile( filePath, function (err, data) {
                if(err || data.length <= 0){
                    if( printDebug ) { util.error(serial + ' get FAIL [' + filePath + '] - no data found'); }
                    fn();
                }else{
                    if( printDebug ) { util.log(serial + ' get OK [' + filePath + '] = ' + data + '.' ); }
                    fn( null, JSON.parse(data) );
                }
            });
        } else{
            if( printDebug ) { util.error(serial + ' get FAIL [' + filePath + '] not exists'); }
            fn();
        }
    });
};

/**
   Commit the given `sess` object associated with the given `sid`.

   @param {String} sid Session ID.
   @param {Session} sess Session values.
   @param {Function} fn Function, that called after set.
   @api public
 */
FileSessionStore.prototype.set = function (sid, sess, fn) {
    var serial = this.count++ //Math.round(Math.random()*1000);
        , printDebug = this.printDebug
        , content = JSON.stringify(sess)
        , dirPath
        , filePath
        ;
    if (!sess.dirName) {
        sess.dirName = this.getPath(sid);
    }

    dirPath = path.join( this.path, sess.dirName );
    filePath = path.join( dirPath, this.prefix );
   
    if( printDebug ) { util.log(serial + ' set [' + filePath + '] = ' + JSON.stringify(sess)); }

    if( !this.useAsync ){
        if (!fs.existsSync(dirPath) && !fs.mkdirSync(dirPath)) {
            if (printDebug ) {
                util.error(serial + ' set err [' + dirPath + ']');
            }
        } else if (!fs.writeFileSync( filePath, content ) ) {
            if (printDebug ) {
                util.error(serial + ' set err [' + filePath + '] = ' + JSON.stringify(sess));
            }
        } else if( printDebug ) {
            util.log(serial + ' set sync OK [' + filePath + '] = ' + JSON.stringify(sess));
        }

        fn && fn();
    } else {
        fs.exists(dirPath, function(exists) {
            if (!exists) {
                fs.mkdir(dirPath, function(err) {

                    if( err && printDebug ) { util.error(serial + 'set err ' + err ); }
                    if( printDebug ) { util.log(serial + ' set created [' + dirPath + ']'); }
                    fs.chmod(dirPath, '0777');
                    fs.writeFile( filePath, content, function(err) {
                        if( err && printDebug ) { util.log(serial + 'set err ' + err ); }
                        if( printDebug ) { util.log(serial + ' set OK [' + filePath + '] = ' + JSON.stringify(sess)); }
                        fn && fn();
                    });
                });
            } else {
                fs.writeFile( filePath, content, function(err) {
                    if( err && printDebug ) { util.error(serial + 'set err ' + err ); }
                    if( printDebug ) { util.log(serial + ' set OK [' + filePath + '] = ' + JSON.stringify(sess)); }
                    fn && fn();
                });
            }
        });

     }
};

/**
   Destroy the session associated with the given `sid`.

   @param {String} sid Session ID.
   @param {Function} fn Function, that called after value delete.
   @api public
 */
FileSessionStore.prototype.destroy = function (sid, fn) {
    var dirName = this.getPath(sid)
        , dirPath = path.join( this.path, dirName )
        , printDebug = this.printDebug
        ;

    fn = fn || function () {};
    util.log('destroy [' + dirPath + ']');
    fs.exists( dirPath, function (exists) {
        if( exists ) {
            wrench.rmdirSyncRecursive( dirPath, function (err) {
                if (err && printDebug) {
                    util.error('destroy err:'+ err+' '+ dirPath);
                }
                fn();
            });
        } else{
            fn();
        }
    });
};

/**
   Invoke the given callback `fn` with all active sessions.
   Method wasn't tested!

   @param {Function} fn Function that applyed to all active sessions.
   @api public
 */
FileSessionStore.prototype.all = function (fn) {
    var self = this
        , result = []
        , filePath
        , dirPath
        ;
    fn = fn || function () {};
    
    fs.readdir( self.path, function(err, files){
        if( files.length <= 0 ){
            fn(null,result);
            return;
        }
        files.forEach(function(d,i){
            dirPath = path.join(self.path, d);
            filePath = path.join(dirPath, self.prefix);
            
            if ( fs.existsSync(filePath) ) {
            
                fs.readFile( filePath, function (err, data) {
                    if( err === null && data ){
                        result.push( JSON.parse(data) );
                    }
                    if( i >= files.length-1 ) { fn(null, result); }
                });
            }else{
                if( i >= files.length-1 ) { fn(null, result); }
            }
        });
    });
};

/**
   Clear all sessions.

   @param {Function} fn Function, that calls after removing all sessions.
   @api public
 */
FileSessionStore.prototype.clear = function (fn) {
    
    var self = this // store 'this' object
        , filePath
        , dirPath
        , printDebug = self.printDebug
        ;
    fn = fn || function () {};
    
    fs.readdir( self.path, function(err, files){
        if ( files.length <= 0 ) {
            fn();
            return;
        }
        files.forEach(function(d,i){
            dirPath = path.join(self.path, d);
            filePath = path.join(dirPath, self.prefix);
            
            if ( fs.existsSync(filePath) ) {
                // log('deleting ' + filePath );
                wrench.rmdirSyncRecursive( dirPath, function (err) {
                    if (err && printDebug) {
                        util.log('clear err:'+ err+' '+ dirPath);
                    }
                    if( i >= files.length-1 ) { fn(); }
                });
            } else {
                if( i >= files.length-1 ) { fn(); }
            }
        });
    });
    
};

/**
   Fetch number of sessions.

   @param {Function} fn Function, that accepts number of sessions.
   @api public
 */
FileSessionStore.prototype.length = function (fn) {
    var self = this
        , result = 0
        , filePath
        ;

    fn = fn || function () {};
    
    fs.readdir( self.path, function(err, files){
        files.forEach( function(d){
            filePath = path.join(self.path, d, self.prefix);
            if( fs.existsSync(filePath) ) { result++; }
        });
        fn( null, result );
    });
};
