CARETRACK – Patient Tracking and Smart Medication Alert System (with backend)
=============================================================================

WHAT CHANGED IN THIS VERSION
----------------------------
CareTrack now has a real backend (server.js). The server is the one shared database:
- Accounts and passwords live on the server. Passwords are stored as salted hashes.
- Each sign-in gives that device a login token, so you can register on one device and
  sign in from another.
- Each user receives only their own data. Patients see only their own records, doctors
  see only their patients, and only admin sees all accounts.
- Registration, appointment requests, approvals, reschedules, messages, prescriptions
  and medicine stock changes are saved on the server and sent to the right people.
- Patient dashboards include a monthly appointment calendar and blood group details.
- The hospital blood bank shows stock for all eight blood groups. Patients can request units;
  admins can approve or reject requests and adjust stock.
- Admin reports show monthly appointment statistics, status breakdowns, specialist coverage
  and patient blood groups. The public home page includes Home, About and Contact links.
- Doctors are notified of new registrations and appointment requests within about
  3 seconds, on any device where they are signed in.

HOW TO RUN (needs Node.js 18 or newer, free from nodejs.org)
-----------------------------------------------------------
1. Unzip the folder. Open a terminal inside the CareTrack folder.
2. Run:   node server.js
3. The terminal prints two links:
   - This computer:  http://localhost:3000   (open it here)
   - Other devices:  http://192.168.x.x:3000 (open it on phones or laptops on the same Wi-Fi)
4. On Windows, if other devices cannot connect, allow Node.js through the firewall
   when Windows asks.
5. Stop the server with Ctrl+C.

Do not use VS Code Live Server for this version. It cannot run the backend.

TESTING ACROSS DEVICES
----------------------
- Device A: open the app, choose Patient > New registration, fill the form, and submit.
- Device B: open the same link, choose Patient > Already registered, and sign in with the
  new username and password. It works straight away.
- Device C: open the link, sign in as a doctor for the chosen doctor, and the new
  registration appears in the notifications with a pop-up.

DEMO ACCOUNTS (fictional, for testing only)
-------------------------------------------
Admin      username: admin        password: admin123
Doctor     username: dr.ananya    password: doctor123   (also dr.rahul, dr.meera, dr.arjun, dr.sneha, dr.kavya, dr.imran, dr.nisha, dr.dev, dr.farah, dr.rohan, dr.leena)
Patient    username: rahul.g      password: patient123  (also priya.n, kiran.d, anita.j, mohan.i)

RESETTING THE DATA
------------------
- Admin > Settings > Reset demo data restores the sample data.
- Or stop the server and delete data/caretrack-db.json. The next start recreates it.
- The old file data/server-db.json from the previous version is no longer used.
  You can delete it.

DEPLOYING ON THE INTERNET
-------------------------
GitHub Pages, Netlify Drop and other static hosts cannot run this backend. Use a Node host
such as Render or Railway:
1. Put the project in a GitHub repository.
2. Create a new Web Service from the repository.
3. Build command: (leave empty)     Start command: node server.js
4. Add an environment variable:  TZ = Asia/Kolkata   (so dates and times match India)
5. Free plans may sleep after inactivity and may delete files on restart. For saved data,
   add a persistent disk and set DATA_DIR to its mount path, for example DATA_DIR=/var/data.

FILES
-----
server.js             Backend: accounts, sessions, role checks, reminders, notifications
package.json          Start script for hosting services
index.html            Entry page
css/style.css         Teal and navy theme, light and dark modes, 3D effects
js/core.js            Connection to the server, sign-in, registration, app shell
js/forms.js           Buttons and forms that send changes to the server
js/views.js           Admin, Doctor and Patient dashboards and startup
data/sample-data.json Fictional demo records loaded on the first run

IMPORTANT LIMITATIONS
---------------------
- This is an academic demonstration. It is not ready for real medical data.
  Before real use it would need HTTPS, rate limiting on sign-in, backups, audit logs and
  a clinical and legal review.
- Browser pop-up alerts appear only while CareTrack is open in a tab. Reminders are saved
  on the server and appear when the patient next opens the app. No SMS or email is sent.
- Login tokens are kept in each browser until the user signs out.
- All people, doctors, records and medicines are fictional. Nothing here is medical advice.
