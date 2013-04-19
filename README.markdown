# connect-session-folder

Can be used to create a folder for the duration of a session, the session info is stored in memory. 

Any session folder that does not match a valid session or that matches an expired session gets deleted with its content this check is performed every `reapInterval

## Installation


## Options

    - `parentFolder` path to parent folder of session folders (optional, default: process.env.TMPDIR) 
    - `fileName` filename storing the session details in the folder (optional, default: `session-info`)
    - `reapInterval` interval between removing stale sessions (optional, default: 600000 (10 mins), disable: -1 )
    - `mode` mode for the folders creation (optional, defaults to '0755') 

## Example

See example/app.js

## Tests

node test.js


## See Also

https://github.com/odogono/connect-session-file
