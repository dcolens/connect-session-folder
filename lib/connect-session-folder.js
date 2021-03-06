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

process.umask(0);
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
		this.mode = options.mode || '0755';
		this.fileName = options.fileName || 'session-info';
		this.reapInterval = options.reapInterval || 600000; // default reapInterval is 10 minutes

		this.parentFolder = options.parentFolder || process.env.TMPDIR;

		// make sure it exists or try to create it before using it
		qfs.exists(this.parentFolder).then(function(exists) {
			return exists ? true : qfs.makeTree(options.parentFolder, self.mode);
		}).then(function() {
			self.emit('connect');
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

			files.forEach(function(folder) {

				var dirPath = qfs.join(self.parentFolder, folder)
					, filePath = qfs.join(dirPath, self.fileName)
					, sid
					;

				qfs.read(filePath)
					.then(function(data) {
						sid = (JSON.parse(data)).sid;
						// if sid not found, that means this is not a session from this server so skip it
						if (!sid) { 
							throw new Error(filePath + ' could not be parsed, sid not found');
						}
						if (!self.sessions[sid]) {
							return self.destroy(null, folder);
						}
						//get() validates if the session did not expire and calls destroy if it did.
						self.get(sid);
					})
					.fail(function(err) {
						util.error('REAP: ' + err + '. This folder will be ignored. If it should be reaped, please do it manually.');
					})
					.done();
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
					self.destroy(sid, null, fn);
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
			, folderName = params.user
			, self = this
			;

		if (!folderName) {
			throw new Error('params.user should be set (='+params.user+') when calling checkP(params).');
		}
		dirPath = qfs.join( this.parentFolder, folderName );
		filePath = qfs.join( dirPath, this.fileName );
		
		return qfs.exists(filePath)
			.then(function(exists) {
				if (exists) { return folderName; }

				return self.createIfNotExistP(dirPath, self.mode)
					.then(function() {
						return qfs.write(filePath, JSON.stringify(params));
					})
					.then(function() {
						return folderName;
					});        
			});
	};

	/**
	 * Destroy the session associated with the given `sid` 
	 * including the session folder (and content) 
	 *
	 * @param {String} sid
	 * @api public
	 */

	SessionFolderMemory.prototype.destroy = function(sid, folder, fn) {
		var self = this
			, dirName = folder || self.sessions[sid].user
			, dirPath = qfs.join( this.parentFolder, dirName )
			, deleteFolder = true
			;

		fn = fn || function() {};

		util.debug('destroy [' + dirPath + ']');
		process.nextTick(function(){
			if (sid) {
				delete self.sessions[sid];
				for (var s in self.sessions) {
					if (self.sessions.hasOwnProperty(s) && (self.sessions[s].user == dirName)) {
						deleteFolder = false;
					}
				}
			}
			if (deleteFolder) {
				qfs.exists(dirPath).then(function (exists) {        
					return exists ? qfs.removeTree(dirPath) : true;
				}).then(function(result) {
					fn(null, result); 
				}, function(error) {
					util.error('destroy: failed to delete session folder', error);
					fn(error);
				});
			}
		});
	};

	return SessionFolderMemory;
};
