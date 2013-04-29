/*jshint smarttabs:true, evil:true, undef:true, node:true, wsh:true, eqnull:true, expr:true, curly:true, trailing:false , unused:true, laxcomma:true*/
"use strict";
/*!
 * Connect - SessionFolderMemory
 * Adding Folders to Connect MemoryStore
 * Copyright(c) 2012 TJ Holowaychuk <tj@vision-media.ca>
 * Copyright(c) 2013 Didier Colens <dcolens@cisco.com>
 * MIT Licensed
 */

var util = require('util')
  , qfs = require('q-io/fs')
  , crypto = require('crypto')
  ;

/**
 * Return the `SessionFolderMemory` extending `connect`'s session Store.
 *
 * @param {object} connect or express
 * @return {Function}
 * @api public
 */

module.exports = function(connect){

  /**
   * Connect's Store.
   */

  var Store = connect.session.Store;

  /**
   * Initialize SessionFolderMemory.
   *
   * @param {Object} options
   * @api public
   */

  function SessionFolderMemory(options) {
    var self = this;
    options = options || {};
    this.sessions = {};
    this.promises = {};
    this.mode = options.mode || '0755';
    this.fileName = options.fileName || 'session-info';
    this.reapInterval = options.reapInterval || 600000; // default reapInterval is 10 minutes

    this.parentFolder = options.parentFolder || process.env.TMPDIR;

    // make sure it exists or try to create it before using it
    qfs.exists(this.parentFolder).then(function(exists) {
      return exists ? true : qfs.makeTree(options.parentFolder, self.mode);
    }).then(function() {
      self.emit('connect');
      self.reap();
    }, function(e) {
      self.emit('disconnect');
      throw e;
    }).done(); // This will throw the error to the main loop
    // interval for reaping stale sessions
    if (this.reapInterval !== -1) {
        setInterval(function (self) {
            self.reap();
        }, this.reapInterval, this);
    }
    
  }

  /**
   * Inherit from `Store`.
   */

  SessionFolderMemory.prototype.__proto__ = Store.prototype;


  /**
   * Reap expired sessions.
   *
   * @api private
   */
  SessionFolderMemory.prototype.reap = function () {
    var self = this; // store 'this' object

    qfs.list(self.parentFolder).then(function(files) {
      if( files.length < 1 ) { return; }

      files.forEach(function(d) {

        var dirPath = qfs.join(self.parentFolder, d)
          , filePath = qfs.join(dirPath, self.fileName)
          , sid
          ;

        qfs.read(filePath).then(
          function(data) {
            sid = (JSON.parse(data)).sid;
            if (!self.sessions[sid]) {
              return self.destroy(sid);
            }
            //get() validates if the session did not expire and calls destroy if it did.
            self.get(sid);
          }
          , function(err) {
            util.error('reap '+filePath+' err:'+ err);
            throw err;
          }).done();
      });
    });
  };

  /**
   * Attempt to fetch session by the given `sid`.
   *
   * @param {String} sid
   * @param {Function} fn
   * @api public
   */

  SessionFolderMemory.prototype.get = function(sid, fn){
    var self = this;
    fn = fn || function() {};

    process.nextTick(function(){
      var expires
        , sess = self.sessions[sid];
      if (sess) {
        sess = JSON.parse(sess);
        expires = ('string' == typeof sess.cookie.expires) ? new Date(sess.cookie.expires) : sess.cookie.expires;
        if (!expires || new Date() < expires) {
          fn(null, sess);
        } else {
          self.destroy(sid, fn);
        }
      } else {
        fn();
      }
    });
  };

  /**
   * Commit the given `sess` object associated with the given `sid`.
   *
   * @param {String} sid
   * @param {Session} sess
   * @param {Function} fn
   * @api public
   */

  SessionFolderMemory.prototype.set = function(sid, sess, fn){
    var self = this;
    process.nextTick(function(){
      self.sessions[sid] = JSON.stringify(sess);
      fn && fn();
    });
  };

  /**
   * Invoke the given callback `fn` with all active sessions.
   *
   * @param {Function} fn
   * @api public
   */

  SessionFolderMemory.prototype.all = function(fn){
    var arr = []
      , keys = Object.keys(this.sessions);
    for (var i = 0, len = keys.length; i < len; ++i) {
      arr.push(this.sessions[keys[i]]);
    }
    fn(null, arr);
  };

  /**
   * Clear all sessions.
   *
   * @param {Function} fn
   * @api public
   */

  SessionFolderMemory.prototype.clear = function(fn){
    this.sessions = {};
    fn && fn();
  };

  /**
   * Fetch number of sessions.
   *
   * @param {Function} fn
   * @api public
   */

  SessionFolderMemory.prototype.length = function(fn){
    fn(null, Object.keys(this.sessions).length);
  };

  //  
  /**
   * promise to check if the given `pathToCheck and creates with 
   * the given `mode` it if it does not exist. 
   * 
   *
   * @param {String} sid
   * @api public
   */
  SessionFolderMemory.prototype.createIfNotExistP = function(pathToCheck, mode) {
      return qfs.exists(pathToCheck)
        .then(function(exists) {
          return exists ? true : qfs.makeTree(pathToCheck, mode);
        });
  };

  /**
   * returns a promise that creates the session folder and session-info
   * file if they don't exist and returns the session folder name for 
   * the given `params`
   *
   * @param {Object} sid, user
   * @api public
   */
  SessionFolderMemory.prototype.checkP = function(params) {
      var dirPath
        , filePath
        , sid = params.sid
        , folderName = this.getPath(sid)
        , self = this;

      if (!this.promises[sid]) {

        dirPath = qfs.join( this.parentFolder, folderName );
        filePath = qfs.join( dirPath, this.fileName );

        this.promises[sid] = this.createIfNotExistP(dirPath, self.mode).then(function() {
          return qfs.write(filePath, JSON.stringify(params));
        }).then(function() {
          return folderName;
        });

      }
      return this.promises[sid];
  };

  /**
   * Destroy the session associated with the given `sid` 
   * including the session folder (and content) 
   *
   * @param {String} sid
   * @api public
   */

  SessionFolderMemory.prototype.destroy = function(sid, fn) {
    var self = this
      , dirName = this.getPath(sid)
      , dirPath = qfs.join( this.parentFolder, dirName )
      ;

    fn = fn || function() {};

    util.log('destroy [' + dirPath + ']');
    process.nextTick(function(){
      delete self.sessions[sid];
      delete self.promises[sid];
      qfs.exists(dirPath).then(function (exists) {        
        return exists ? qfs.removeTree(dirPath) : true;
      }).then(fn, fn);
    });
  };

  /**
   * Converts the given `sid` to a valid path name
   *
   * @param {String} sid
   * @api public
   */
  SessionFolderMemory.prototype.getPath = function(sid) {
    return crypto.createHash('md5').update(sid).digest('hex');
  };

   /**
   * strips file containing the session details from list provided
   *
   * @param {String} sid
   * @api private
   */
  SessionFolderMemory.prototype._removePrefix = function(files) {
    var i = files.indexOf(this.fileName);
    if (i >- 1) { files.splice(i, 1); }
    return files;
  };

   /**
   * returns the list of files in the folder for the given `sid`
   *
   * @param {String} sid
   * @api public
   */
  SessionFolderMemory.prototype.list = function(sid, guard, fn) {
    var self = this
      , dirPath = qfs.join( this.parentFolder, this.getPath(sid) )
      , promise = qfs.listTree(dirPath, guard)
          .then(function(files) {
            files = self._removePrefix(files);
          })
      ;
    if (fn) {
      return promise.nfcall(fn);
    } else {
      return promise;
    }
  };

  return SessionFolderMemory;
};
