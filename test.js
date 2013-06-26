
/*jshint smarttabs:true, evil:true, undef:true, node:true, wsh:true, eqnull:true, expr:true, curly:true, trailing:false , unused:true, laxcomma:true*/
'use strict';
/**
 * Module dependencies.
 */

var assert = require('assert')
  , connect = require('connect')
  , FMStore = require('./')(connect)
  , fs = require('fs')
  , parentFolder = __dirname+'/testStore'
  , permission = '0755';
  ;

assert.ok(!fs.existsSync(parentFolder), parentFolder+ ' should not exist');

var store = new FMStore({parentFolder: parentFolder, permission: permission});

store.on('connect', function(){

  console.log('store up');
  assert.ok(fs.existsSync(parentFolder), 'parentFolder not created');
  var stat = fs.statSync(parentFolder);
  assert.equal(parseInt(stat.mode.toString(8), 10), '4'+permission, 'permission should be '+permission+' for '+parentFolder);

  // #set()
  store.set('123', { cookie: { maxAge: 2000 }, name: 'dc' }, function(err){
    assert.ok(!err, '#set() got an error');
    console.log('session created');
    store.checkP({sid: '123', otherStuff:'lalala', user: 'testuser'}).then(function(folder) {

      console.log('folder created');
      assert.ok((folder==='testuser'), 'folder name not returned');
      assert.ok(fs.existsSync(parentFolder+'/'+folder), 'session folder not created');
      assert.ok(fs.existsSync(parentFolder+'/'+folder+'/session-info'), 'session-info file not created');

      // #get()
      store.get('123', function(err, data){

        assert.ok(!err, '#get() got an error');

        assert.deepEqual({ cookie: { maxAge: 2000 }, name: 'dc' }, data);

        // #set null
        store.set('123', { cookie: { maxAge: 2000 }, name: 'dc' }, function(){
          store.destroy('123', 'testuser', function(e){
            assert.ok(!e, "destory should succeed");
            fs.rmdirSync(parentFolder);
            assert.ok(!fs.existsSync(parentFolder), parentFolder+ " should not exist");
            store.length(function(e,l) {
              assert.equal(l, 0, "store should be empty");
              console.log('done');
              process.exit();
            });
          });
        });
        throw new Error('Error in fn');
      });      
    }).done();
  });
});

process.once('uncaughtException', function (err) {
  assert.ok(err.message === 'Error in fn', '#get() catch wrong error');
});