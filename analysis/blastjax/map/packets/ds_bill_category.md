# Node ds:bill_category: bill_category
Kind: datastore
## Outgoing connections
- none

## Incoming connections
- routers/bill.py (be:router:bill) -> read
- routers/bill.py (be:router:bill) -> write
- routers/search.py (be:router:search) -> read
