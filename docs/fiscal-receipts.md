# Fiscal receipts (REGOS:VCR), v2.6

The till sends a fiscal receipt for every visit fully paid in **cash or card**, through REGOS:VCR
running on the **main till's PC**. Extra tills (satellites) need nothing: their calls go to the
main till. Same pipeline as SavdoChef.

## Setting up on the clinic PC

1. Install and run REGOS:VCR with the fiscal module (USB) and its printer, as REGOS instructs.
2. On the main till: **Settings → Fiscal receipt**.
   - VCR address `127.0.0.1`, port `22298`, cashier login (`cassir`) and password.
   - Press **Check connection**. It should show the terminal number.
   - VAT: **No VAT** (medical services are VAT-exempt). Choose 12 % only if your accountant says so.
   - MXIK codes per service kind are filled in for a parasitology clinic. Drugs and ointments
     (direct sale) need a code each, in **Services**.
   - Tick **Issue fiscal receipts** and save.
3. Open a shift (**Shift → Open shift**). VCR's Z-report opens with it.

## Every day

- **Payment:** the money is saved at once. The receipt goes to VCR right after, in the
  background. If VCR is off or offline, the visit waits ("Waiting") and is sent later. Use
  **Send again** on the visit or on the Shift page.
- **Closing the shift:** the waiting receipts are sent first, then the Z-report is closed. The
  Shift page shows any receipt that was not sent.
- **Not fiscalised:** a visit paid partly by transfer or insurance, and a visit paid before v2.6.
  These are marked "Not fiscal".
- **Refused:** VCR can refuse a receipt, for example for a wrong MXIK. The visit then shows
  **Error** with VCR's reason. Fix the code in **Services**, then press **Send again**.

## Codes (tasnif.soliq.uz, checked 2026-11-16)

| Kind | MXIK | Package |
|---|---|---|
| Parasitologist consultation | 10902001034000000 | 1321927 |
| Lab analyses | 10902002003000999 | 1321964 |
| Procedures, courses | 10902003035000000 | 1322001 |

**Search tasnif** in the services form finds other codes by words, in Russian or Uzbek. Only the
search words are sent.

## Trying it without a fiscal module (development)

```
npm run dev:fake-vcr      # http://127.0.0.1:22298/, login cassir, password pass
```

Never run it on a PC with a real VCR (same port).
