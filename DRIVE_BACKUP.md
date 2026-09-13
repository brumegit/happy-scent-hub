# Google Drive backup of the app

Every push to `main` that touches the app code, the documentation or the
configuration automatically uploads a fresh copy to your Google Drive:

- `android/` → Google Drive folder **App/Android**
- `ios/` → Google Drive folder **App/iOS**
- documentation and plans → Google Drive folder **App/Lovable**

The **Lovable** folder contains:

- `docs/` — every `.md` guide (release guides, Bluetooth reference and
  debugging guide, store listings, version notes, README)
- `plans/` — every approved build plan
- `config/` — `package.json` and `capacitor.config.ts`
- `build-notes/` — one dated note per build, with the version and build number,
  the commit, and the list of changed files (never overwritten, they pile up)

Version notes live in `VERSION_NOTES.md` and are updated for every new version
or build.

The workflow is `.github/workflows/backup-drive.yml`. You can also run it
manually from GitHub → Actions → "Backup native folders to Google Drive" →
Run workflow.

Build output (`build/`, `.gradle/`, `Pods/`) is excluded — only real source
and config files are archived.

## One-time setup (about 10 minutes)

1. **Create a service account**
   - Go to https://console.cloud.google.com → create (or pick) a project.
   - Enable the **Google Drive API** for that project.
   - Go to **IAM & Admin → Service Accounts → Create service account**
     (name it e.g. `brume-drive-backup`).
   - Open it → **Keys → Add key → JSON**. A `.json` file downloads.
   - Copy the service account **email** shown there
     (looks like `brume-drive-backup@...iam.gserviceaccount.com`).

2. **Share your Drive folders with it**
   - In Google Drive, right-click the **Android** folder → Share → add the
     service account email as **Editor**. Do the same for **iOS** and **Lovable**.
   - Open each folder and copy its **folder ID** from the address bar:
     `https://drive.google.com/drive/folders/THIS_PART_IS_THE_ID`

3. **Add 4 secrets to the GitHub repository**
   - Repo → Settings → Secrets and variables → Actions → New repository secret:
     - `GDRIVE_SERVICE_ACCOUNT_JSON` → full contents of the downloaded `.json` file
     - `GDRIVE_ANDROID_FOLDER_ID` → the ID of your **Android** folder
     - `GDRIVE_IOS_FOLDER_ID` → the ID of your **iOS** folder
     - `GDRIVE_LOVABLE_FOLDER_ID` → the ID of your **Lovable** folder

Done. The next update will sync automatically, and the run log appears under
GitHub → Actions.
