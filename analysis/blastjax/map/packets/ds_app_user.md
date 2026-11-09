# Node ds:app_user: app_user
Kind: datastore
## Outgoing connections
- none

## Incoming connections
- security.py (be:core:security) -> read
- routers/auth.py (be:router:auth) -> read
- routers/user.py (be:router:user) -> read
- routers/user.py (be:router:user) -> write
