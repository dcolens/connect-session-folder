# connect-session-folder

Is a quick clone of https://github.com/odogono/connect-session-file modified to create a session folder that can be used to
store temporary data. A file in the session folder contains the traditional session data (req.session). 

The folder and its content gets deleted when the session expires.

## Installation


## Options

    - `path` parent folder for session folders (optional, default: process.env.TMPDIR) 
    - `prefix` filename storing the session details in the folder (optional, default: `session-info`)
    - `useAsync` use asynchronous file operations (optional, default: false)
    - `printDebug` prints debug output (optional, default: false)
    - `reapInterval` interval between removing stale sessions (optional, default: 600000 (10 mins), disable: -1 )
    - `maxAge` maximum age of sessions before removal (optional, default: 600000*3 (30 mins) )

## Example

See example/app.js

With express:

    var FileStore = require('connect-session-folder');

    app.use(express.session({
        secret: settings.cookie_secret,
        store: new FileSessionStore({
          db: settings.db
        })
      }));


## Tests

TBD


## See Also

https://github.com/odogono/connect-session-file

https://github.com/kcbanner/connect-mongo

https://github.com/bartt/connect-session-mongo
