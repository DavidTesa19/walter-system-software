# Google Calendar Integration Setup Guide

To enable the editable Google Calendar in Walter System, you need to create a Google Cloud Project and get a Client ID.

## Step 1: Create a Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Click **Select a project** > **New Project**.
3. Name it "Walter System" and click **Create**.

## Step 2: Enable Google Calendar API
1. In the sidebar, go to **APIs & Services** > **Library**.
2. Search for "Google Calendar API".
3. Click on it and click **Enable**.

## Step 3: Configure OAuth Consent Screen
1. Go to **APIs & Services** > **OAuth consent screen**.
2. Select **External** (or Internal if you have a Google Workspace organization) and click **Create**.
3. Fill in the required fields:
   - **App name**: Walter System
   - **User support email**: Your email
   - **Developer contact information**: Your email
4. Click **Save and Continue**.
5. **Scopes**: Click **Add or Remove Scopes**.
   - Search for `calendar` and select `.../auth/calendar` (See, edit, share, and permanently delete all the calendars you can access using Google Calendar).
   - Click **Update**, then **Save and Continue**.
6. **Test Users**: Add your own email address as a test user.
   - Click **Add Users**, enter your email, click **Add**.
   - Click **Save and Continue**.

## Step 4: Create Credentials
1. Go to **APIs & Services** > **Credentials**.
2. Click **Create Credentials** > **OAuth client ID**.
3. Application type: **Web application**.
4. Name: "Walter System Client".
5. **Authorized JavaScript origins**:
   - Add `http://localhost:5173` (or whatever port your frontend runs on).
   - Add `http://localhost:3004` (just in case).
6. Click **Create**.
7. Copy the **Client ID** (it looks like `123456789-abcdefg.apps.googleusercontent.com`).

## Step 5: Configure Application
1. Open `client/.env` in your project.
2. Add the following line:
   ```
   VITE_GOOGLE_CLIENT_ID=your_client_id_here
   ```
3. Restart your frontend server (`npm run client:dev`).

## Troubleshooting
- **Error 401 (Unauthorized)**: Your token expired or Client ID is invalid. Try logging out and back in.
- **Error 403 (Forbidden)**: You didn't add your email to "Test Users" or didn't enable the Calendar API.
- **Popup Closed by User**: You must allow popups for the login window.
