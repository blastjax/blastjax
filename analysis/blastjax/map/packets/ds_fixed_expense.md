# Node ds:fixed_expense: fixed_expense
Kind: datastore
## Outgoing connections
- none

## Incoming connections
- routers/credit_card.py (be:router:credit_card) -> write
- routers/fixed_expense.py (be:router:fixed_expense) -> read
- routers/fixed_expense.py (be:router:fixed_expense) -> write
- routers/search.py (be:router:search) -> read
