# Node web:settings: /settings
Kind: module
Language: typescript, 1239 lines of code, location: web/src/app/settings

Files in this directory (largest first):
- web/src/app/settings/UsersSettingsPanel.tsx
- web/src/app/settings/CompaniesSettingsPanel.tsx
- web/src/app/settings/PayslipDefaultsPanel.tsx
- web/src/app/settings/PasskeysSettingsPanel.tsx
- web/src/app/settings/SettingsClient.tsx
- web/src/app/settings/page.tsx

Source excerpt: web/src/app/settings/UsersSettingsPanel.tsx (first 150 lines)
```
   1  "use client";
   2  
   3  import { confirmDialog } from "@/components/ConfirmDialog";
   4  import { useEffect, useState } from "react";
   5  import {
   6    createAppUser,
   7    deleteAppUser,
   8    getAppUsers,
   9    updateAppUser,
  10    updateAppUserAccess,
  11    verifyAppUserPassword,
  12    type AppUserRow,
  13  } from "@/lib/api";
  14  import { formatDate } from "@/lib/dateFormat";
  15  import { RESTRICTABLE_PAGES } from "@/lib/nav";
  16  import { ErrorAlert } from "@/components/ErrorAlert";
  17  import { LoadingBlocks } from "@/components/FinanceUI";
  18  import {
  19    ACTION_BUTTON_CLASSES,
  20    CARD_CLASSES,
  21    DASHED_EMPTY_CLASSES,
  22    DELETE_BUTTON_CLASSES,
  23    EDIT_BUTTON_CLASSES,
  24    INPUT_CLASSES,
  25    PRIMARY_BUTTON_CLASSES,
  26    SECONDARY_BUTTON_CLASSES,
  27  } from "@/lib/ui";
  28  
  29  const MIN_PASSWORD_LENGTH = 8;
  30  
  31  type EditState = { username: string; password: string; confirm: string };
  32  
  33  function emptyEdit(username: string): EditState {
  34    return { username, password: "", confirm: "" };
  35  }
  36  
  37  function AccessControls({
  38    user,
  39    onSaved,
  40  }: {
  41    user: AppUserRow;
  42    onSaved: (u: AppUserRow) => void;
  43  }) {
  44    const [saving, setSaving] = useState(false);
  45    const [error, setError] = useState<string | null>(null);
  46    const allowed = new Set(user.allowed_pages ?? RESTRICTABLE_PAGES.map((p) => p.href));
  47  
  48    async function save(next: { is_superuser: boolean; allowed_pages: string[] | null }) {
  49      setSaving(true);
  50      setError(null);
  51      try {
  52        const res = await updateAppUserAccess(user.id, next);
  53        onSaved(res.user);
  54      } catch (e: unknown) {
  55        setError(e instanceof Error ? e.message : "Failed to update access.");
  56      } finally {
  57        setSaving(false);
  58      }
  59    }
  60  
  61    function togglePage(href: string) {
  62      const next = new Set(allowed);
  63      if (next.has(href)) next.delete(href);
  64      else next.add(href);
  65      save({ is_superuser: user.is_superuser, allowed_pages: [...next] });
  66    }
  67  
  68    return (
  69      <div className="mt-3 rounded-lg border border-line bg-zinc-50/60 px-3 py-3 dark:bg-zinc-900/30">
  70        <label className="flex items-center gap-2 text-xs font-medium text-ink">
  71          <input
  72            type="checkbox"
  73            checked={user.is_superuser}
  74            disabled={saving}
  75            onChange={(e) =>
  76              save({ is_superuser: e.target.checked, allowed_pages: user.allowed_pages })
  77            }
  78          />
  79          Superuser (sees every page)
  80        </label>
  81        {!user.is_superuser && (
  82          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
  83            {RESTRICTABLE_PAGES.map((p) => (
  84              <label key={p.href} className="flex items-center gap-1.5 text-xs text-ink-2">
  85                <input
  86                  type="checkbox"
  87                  checked={allowed.has(p.href)}
  88                  disabled={saving}
  89                  onChange={() => togglePage(p.href)}
  90                />
  91                {p.label}
  92              </label>
  93            ))}
  94          </div>
  95        )}
  96        {error && (
  97          <ErrorAlert className="mt-2">
  98            {error}
  99          </ErrorAlert>
 100        )}
 101      </div>
 102    );
 103  }
 104  
 105  export function UsersSettingsPanel() {
 106    const [users, setUsers] = useState<AppUserRow[]>([]);
 107    const [loading, setLoading] = useState(true);
 108    const [loadError, setLoadError] = useState<string | null>(null);
 109  
 110    const [newUser, setNewUser] = useState<EditState>(emptyEdit(""));
 111    const [addError, setAddError] = useState<string | null>(null);
 112    const [adding, setAdding] = useState(false);
 113  
 114    const [editingId, setEditingId] = useState<string | null>(null);
 115    const [editState, setEditState] = useState<EditState>(emptyEdit(""));
 116    const [editError, setEditError] = useState<string | null>(null);
 117    const [savingEdit, setSavingEdit] = useState(false);
 118  
 119    const [infoMsg, setInfoMsg] = useState<string | null>(null);
 120  
 121    const [verifyUsername, setVerifyUsername] = useState("");
 122    const [verifyPassword, setVerifyPassword] = useState("");
 123    const [verifying, setVerifying] = useState(false);
 124    const [verifyResult, setVerifyResult] = useState<"valid" | "invalid" | null>(null);
 125    const [verifyError, setVerifyError] = useState<string | null>(null);
 126  
 127    const load = () => {
 128      setLoading(true);
 129      setLoadError(null);
 130      getAppUsers()
 131        .then((res) => setUsers(res.users))
 132        .catch((e: unknown) =>
 133          setLoadError(e instanceof Error ? e.message : "Failed to load users."),
 134        )
 135        .finally(() => setLoading(false));
 136    };
 137  
 138    useEffect(() => {
 139      load();
 140    }, []);
 141  
 142    useEffect(() => {
 143      if (!infoMsg) return;
 144      const t = window.setTimeout(() => setInfoMsg(null), 2800);
 145      return () => window.clearTimeout(t);
 146    }, [infoMsg]);
 147  
 148    async function handleAdd() {
 149      const username = newUser.username.trim();
 150      if (!username) {
```

## Outgoing connections
- dispatch -> routers/auth.py (be:router:auth)
- dispatch -> routers/company.py (be:router:company)
- dispatch -> routers/user.py (be:router:user)
- call -> components/AuthGate.tsx (web:components:AuthGate)
- call -> components/ConfirmDialog.tsx (web:components:ConfirmDialog)
- call -> components/ErrorAlert.tsx (web:components:ErrorAlert)
- call -> components/FinanceUI.tsx (web:components:FinanceUI)
- call -> components/PageHeader.tsx (web:components:PageHeader)
- call -> lib/api.ts (web:lib:api)
- call -> lib/auth.ts (web:lib:auth)
- call -> lib/dateFormat.ts (web:lib:dateFormat)
- call -> lib/nav.ts (web:lib:nav)
- call -> lib/ui.ts (web:lib:ui)

## Incoming connections
- none
