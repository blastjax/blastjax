# Node web:payslip: /payslip
Kind: module
Language: typescript, 3292 lines of code, location: web/src/app/payslip

Files in this directory (largest first):
- web/src/app/payslip/PayslipClientModal.tsx
- web/src/app/payslip/PayslipClient.tsx
- web/src/app/payslip/PayslipYearStatsSection.tsx
- web/src/app/payslip/pdfs/PdfBulkUploadClient.tsx
- web/src/app/payslip/payslipAggregates.ts
- web/src/app/payslip/payslipModalForm.ts
- web/src/app/payslip/PayslipFormFields.tsx
- web/src/app/payslip/payslipDraft.ts
- web/src/app/payslip/PayslipFieldMonthsModal.tsx
- web/src/app/payslip/YearPayslipBlock.tsx
- web/src/app/payslip/payslipStatConstants.ts
- web/src/app/payslip/payslipDisplay.ts
- web/src/app/payslip/[company]/page.tsx
- web/src/app/payslip/page.tsx
- web/src/app/payslip/payslipNav.ts
- web/src/app/payslip/settings/page.tsx
- web/src/app/payslip/pdfs/page.tsx

Source excerpt: web/src/app/payslip/PayslipClientModal.tsx (first 150 lines)
```
   1  "use client";
   2  
   3  import { confirmDialog } from "@/components/ConfirmDialog";
   4  import {
   5    useEffect,
   6    useRef,
   7    useState,
   8    type Dispatch,
   9    type MutableRefObject,
  10    type SetStateAction,
  11  } from "react";
  12  import { Modal } from "@/components/Modal";
  13  import {
  14    apiFetch,
  15    companyColumnFlags,
  16    deletePayslipPdf,
  17    payslipPdfUrl,
  18    readPayslipPdf,
  19    uploadPayslipPdf,
  20    type CompanyRow,
  21    type PayslipPdfFields,
  22    type PayslipRow,
  23  } from "@/lib/api";
  24  import { PayslipFormFields } from "./PayslipFormFields";
  25  import {
  26    clearPayslipModalDraft,
  27    formFromRow,
  28    stashPayslipModalDraft,
  29  } from "./payslipDraft";
  30  import {
  31    detailPayslipNeighbors,
  32    deductionsTotalFromRow,
  33    grossTotalFromRow,
  34    rowsForSlot,
  35  } from "./payslipAggregates";
  36  import { fmtNum, fmtPayPeriod, slotTitle } from "./payslipDisplay";
  37  import type { FormState } from "./payslipModalForm";
  38  import type { Nav } from "./payslipNav";
  39  import { ErrorAlert } from "@/components/ErrorAlert";
  40  import {
  41    DANGER_TEXT_BUTTON_CLASSES,
  42    DIALOG_BODY_CLASSES,
  43    DIALOG_CLASSES,
  44    DIALOG_FOOTER_CLASSES,
  45    Field,
  46    ModalHeader,
  47    TEXT_BUTTON_CLASSES,
  48  } from "@/components/FinanceUI";
  49  import { ChevronLeftIcon, ChevronRightIcon } from "@/components/Icons";
  50  import {
  51    DELETE_BUTTON_CLASSES,
  52    FILE_INPUT_CLASSES,
  53    ICON_BUTTON_CLASSES,
  54    PRIMARY_BUTTON_CLASSES,
  55    SECONDARY_BUTTON_CLASSES,
  56    alertClasses,
  57  } from "@/lib/ui";
  58  
  59  const TITLE_ID = "payslip-modal-title";
  60  
  61  export function PayslipClientModal({
  62    nav,
  63    setNav,
  64    rows,
  65    modalForm,
  66    setModalForm,
  67    companies,
  68    saving,
  69    error,
  70    modalFormRef,
  71    goBack,
  72    saveEdit,
  73    saveAddInModal,
  74    handleDelete,
  75    onPdfChange,
  76  }: {
  77    nav: Nav;
  78    setNav: Dispatch<SetStateAction<Nav | null>>;
  79    rows: PayslipRow[];
  80    modalForm: FormState;
  81    setModalForm: Dispatch<SetStateAction<FormState>>;
  82    companies: CompanyRow[];
  83    saving: boolean;
  84    error: string | null;
  85    modalFormRef: MutableRefObject<FormState>;
  86    goBack: () => void;
  87    saveEdit: (pdf: File | null) => void | Promise<void>;
  88    saveAddInModal: (pdf: File | null) => void | Promise<void>;
  89    handleDelete: (id: string) => void | Promise<void>;
  90    onPdfChange: (id: string, hasPdf: boolean) => void;
  91  }) {
  92    // The PDF picked on this screen; another screen (a new nav) starts without one.
  93    const [picked, setPicked] = useState<{ nav: Nav; file: File } | null>(null);
  94    const pdf = picked?.nav === nav ? picked.file : null;
  95    const pdfReader = (
  96      <PayslipPdfReader
  97        disabled={saving}
  98        slot={nav.screen === "add" && !nav.freeform ? nav : null}
  99        onFile={(file) => setPicked(file && { nav, file })}
 100        onRead={(found) =>
 101          setModalForm((f) => ({ ...formFromRow({ ...found, company: f.company }), notes: found.notes ?? f.notes }))
 102        }
 103      />
 104    );
 105    const onCloseDialog = () => {
 106      if (nav.screen === "edit" || nav.screen === "add") {
 107        stashPayslipModalDraft(nav, modalFormRef.current);
 108      }
 109      setNav(null);
 110    };
 111    const flags = companyColumnFlags(companies, modalForm.company);
 112    return (
 113      <Modal
 114        open
 115        onClose={onCloseDialog}
 116        ariaLabelledBy={TITLE_ID}
 117        dialogClassName={`${DIALOG_CLASSES} max-w-5xl lg:max-w-6xl`}
 118      >
 119              {nav.screen === "detail" && (() => {
 120                const row = rows.find((r) => r.id === nav.row.id) ?? nav.row;
 121                const detailFlags = companyColumnFlags(companies, row.company);
 122                const { older, newer } = detailPayslipNeighbors(rows, row.id);
 123                return (
 124                <>
 125                  <ModalHeader
 126                    id={TITLE_ID}
 127                    title="Details"
 128                    subtitle={fmtPayPeriod(row.period_year, row.period_month, row.period_half)}
 129                    actions={
 130                      <>
 131                        <button
 132                          type="button"
 133                          className={ICON_BUTTON_CLASSES}
 134                          aria-label="Older payslip"
 135                          data-tooltip="Older payslip"
 136                          disabled={!older}
 137                          onClick={() => older && setNav({ screen: "detail", row: older })}
 138                        >
 139                          <ChevronLeftIcon className="size-5" />
 140                        </button>
 141                        <button
 142                          type="button"
 143                          className={ICON_BUTTON_CLASSES}
 144                          aria-label="Newer payslip"
 145                          data-tooltip="Newer payslip"
 146                          disabled={!newer}
 147                          onClick={() => newer && setNav({ screen: "detail", row: newer })}
 148                        >
 149                          <ChevronRightIcon className="size-5" />
 150                        </button>
```

## Outgoing connections
- dispatch -> routers/company.py (be:router:company)
- dispatch -> routers/payslip.py (be:router:payslip)
- dispatch -> routers/payslip_default.py (be:router:payslip_default)
- call -> components/AmountInput.tsx (web:components:AmountInput)
- call -> components/CompanyRedirect.tsx (web:components:CompanyRedirect)
- call -> components/ConfirmDialog.tsx (web:components:ConfirmDialog)
- call -> components/ErrorAlert.tsx (web:components:ErrorAlert)
- call -> components/FinanceUI.tsx (web:components:FinanceUI)
- call -> components/Icons.tsx (web:components:Icons)
- call -> components/Modal.tsx (web:components:Modal)
- call -> components/PageHeader.tsx (web:components:PageHeader)
- call -> components/YearMonthGrid.tsx (web:components:YearMonthGrid)
- call -> components/YearPickerField.tsx (web:components:YearPickerField)
- call -> lib/api.ts (web:lib:api)
- call -> lib/dateFormat.ts (web:lib:dateFormat)
- call -> lib/formatNumber.ts (web:lib:formatNumber)
- call -> lib/parseFormNumber.ts (web:lib:parseFormNumber)
- call -> lib/ui.ts (web:lib:ui)
- call -> lib/useWheelStep.ts (web:lib:useWheelStep)

## Incoming connections
- none
