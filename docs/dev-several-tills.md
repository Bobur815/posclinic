# Several tills on one PC (development)

To try the whole clinic flow on one computer (reception, doctor, nurse, admin at the same time),
run one **main till** and up to three **satellite tills**. Each copy gets its own data folder with
`--profile=<name>`, so each has its own login and settings. Installed (packaged) tills ignore
`--profile`.

| Terminal | Command | Data folder (`%APPDATA%`) |
|---|---|---|
| 1 | `npm run dev:pos` (main till: the clinic database, Vite on :5175) | `posclinic` |
| 2 | `npm run dev:pos:doctor` | `posclinic-doctor` |
| 3 | `npm run dev:pos:nurse` | `posclinic-nurse` |
| 4 | `npm run dev:pos:admin` | `posclinic-admin` |

Also `npm run dev:pos:reception`. Any other name: `npm run dev:pos:extra --profile=<name>` (in PowerShell without `--`: PowerShell removes it, and npm passes the profile on as `npm_config_profile`). The folders are created on first start; nothing to make by hand.

Terminal 1 must stay running: the other copies use its build (`dist-electron`) and its renderer
dev server (`localhost:5175`). After a change to `src/main`, restart the extra copies (the
renderer reloads by itself).

## First time

1. **Main till (terminal 1)**: already linked to the clinic. In **Settings → Satellites**, switch
   satellites on and press **Issue code** (shows a 6-digit code and the main till's address).
2. **Each extra copy** opens the setup wizard. Choose **Join a main till**, enter the main till's
   address as `127.0.0.1:<port>` (the port shown in Settings → Satellites; a development build
   allows this PC's own address) and the code. Issue a new code for each copy.
3. Sign in on each copy with a different user:
   - **Reception**: a receptionist (Staff page → Add staff → Reception).
   - **Doctor**: a doctor with a login (Doctors page → Create login, or Link existing login).
   - **Nurse**: a nurse (Staff page → Nurse / lab).
   - **Admin**: the clinic admin made at setup.

Every copy works on the main till's database: a visit registered at "reception" appears at once in
the doctor's queue, the nurse's lab page and the admin's dashboard.

The plan's `terminals` limit counts the main till plus its satellites (a VIP clinic has no limit).

## Starting over

Close the copy and delete its `%APPDATA%\posclinic-<name>` folder. The main till's folder
(`posclinic`) holds the clinic data: do not delete it.
