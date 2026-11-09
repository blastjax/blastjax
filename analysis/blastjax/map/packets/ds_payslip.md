# Node ds:payslip: payslip
Kind: datastore
## Outgoing connections
- none

## Incoming connections
- routers/company.py (be:router:company) -> read
- routers/payslip.py (be:router:payslip) -> read
- routers/payslip.py (be:router:payslip) -> write
