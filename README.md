# Sign In with LinkedIn using Firebase

Authenticate users with LinkedIn Sign-In via Firebase Custom Auth tokens. Uses LinkedIn's OpenID Connect (OIDC) flow and Firebase Functions v2.

## Prerequisites

- Node.js 20+
- Firebase CLI (`npm install -g firebase-tools`)
- Firebase project on the **Blaze** plan (required for outbound HTTP requests)

## Setup

### 1. Firebase Project

1. Create a project in the [Firebase Console](https://console.firebase.google.com)
2. Enable **Realtime Database** and **Authentication**

### 2. Service Account

1. Go to **Project Settings > Service Accounts** in the Firebase Console
2. Click **Generate new private key**
3. Save the file as `./functions/service-account.json`

### 3. LinkedIn App

1. Create an app at [LinkedIn Developers](https://www.linkedin.com/developers/apps/)
2. Under **Products**, enable **Sign In with LinkedIn using OpenID Connect**
3. Under **Auth > OAuth 2.0 settings**, add the authorized redirect URL:
   ```
   https://<your-project-id>.firebaseapp.com/popup.html
   ```

### 4. Configure Credentials

Copy the example env file and fill in your LinkedIn app credentials:

```bash
cp functions/.env.example functions/.env
```

Edit `functions/.env`:
```
LINKEDIN_CLIENT_ID=your_client_id
LINKEDIN_CLIENT_SECRET=your_client_secret
```

> The `.env` file is gitignored. Never commit your client secret.

### 5. Deploy

```bash
firebase use --add  # select your project
cd functions && npm install
cd ..
firebase deploy
```

## Usage

Open `https://<your-project-id>.firebaseapp.com/` and click **Sign in with LinkedIn**.

## How It Works

1. User clicks sign-in, opening `popup.html`
2. `popup.html` redirects to the `redirect` Cloud Function
3. The function sets a `state` cookie (CSRF protection) and redirects to LinkedIn's OAuth consent screen
4. LinkedIn redirects back to `popup.html` with an auth code
5. `popup.html` calls the `token` Cloud Function via JSONP
6. The `token` function:
   - Validates the `state` cookie against the query parameter
   - Exchanges the auth code for an access token
   - Fetches the user profile from LinkedIn's OIDC `userinfo` endpoint
   - Creates/updates a Firebase Auth user
   - Returns a Firebase Custom Auth token
7. `popup.html` signs into Firebase with the custom token and closes
8. The main page detects the auth state change and displays user info
