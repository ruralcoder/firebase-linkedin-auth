/**
 * Copyright 2016 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

const { onRequest } = require('firebase-functions/v2/https');
const { defineString } = require('firebase-functions/params');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');

const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getDatabase } = require('firebase-admin/database');

initializeApp();

const LINKEDIN_CLIENT_ID = defineString('LINKEDIN_CLIENT_ID');
const LINKEDIN_CLIENT_SECRET = defineString('LINKEDIN_CLIENT_SECRET');

const OAUTH_SCOPES = 'openid profile email';

/**
 * Redirects the user to the LinkedIn authentication consent screen.
 * Sets a 'state' cookie for CSRF verification.
 */
exports.redirect = onRequest((req, res) => {
  cookieParser()(req, res, () => {
    const state = crypto.randomBytes(20).toString('hex');

    res.cookie('state', state, {
      maxAge: 3600000,
      secure: true,
      httpOnly: true,
    });

    const redirectUri = `https://${process.env.GCLOUD_PROJECT}.firebaseapp.com/popup.html`;
    const authUrl = 'https://www.linkedin.com/oauth/v2/authorization' +
      `?response_type=code` +
      `&client_id=${LINKEDIN_CLIENT_ID.value()}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${state}` +
      `&scope=${encodeURIComponent(OAUTH_SCOPES)}`;

    res.redirect(authUrl);
  });
});

/**
 * Exchanges a LinkedIn auth code for a Firebase custom auth token.
 * Validates the 'state' cookie against the 'state' query parameter.
 * Returns the token via JSONP callback.
 */
exports.token = onRequest((req, res) => {
  try {
    cookieParser()(req, res, async () => {
      try {
        if (!req.cookies.state) {
          throw new Error('State cookie not set or expired. Maybe you took too long to authorize. Please try again.');
        }

        if (req.cookies.state !== req.query.state) {
          throw new Error('State validation failed. Possible CSRF attack.');
        }

        console.log('Received auth code:', req.query.code);

        const redirectUri = `https://${process.env.GCLOUD_PROJECT}.firebaseapp.com/popup.html`;

        // Exchange auth code for access token
        const tokenResponse = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code: req.query.code,
            redirect_uri: redirectUri,
            client_id: LINKEDIN_CLIENT_ID.value(),
            client_secret: LINKEDIN_CLIENT_SECRET.value(),
          }),
        });

        if (!tokenResponse.ok) {
          const errorText = await tokenResponse.text();
          throw new Error(`LinkedIn token exchange failed: ${errorText}`);
        }

        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;

        console.log('Received Access Token');

        // Fetch user profile via OIDC userinfo endpoint (returns name, email, picture)
        const profileResponse = await fetch('https://api.linkedin.com/v2/userinfo', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!profileResponse.ok) {
          const errorText = await profileResponse.text();
          throw new Error(`LinkedIn userinfo fetch failed: ${errorText}`);
        }

        const profile = await profileResponse.json();

        console.log('LinkedIn profile received for:', profile.sub);

        const firebaseToken = await createFirebaseAccount(
          profile.sub,
          profile.name,
          profile.picture,
          profile.email,
          accessToken
        );

        res.jsonp({ token: firebaseToken });
      } catch (error) {
        console.error('Token exchange error:', error);
        res.jsonp({ error: error.toString() });
      }
    });
  } catch (error) {
    return res.jsonp({ error: error.toString() });
  }
});

/**
 * Creates a Firebase account with the given user profile and returns a custom auth token.
 * Also saves the accessToken to the datastore at /linkedInAccessToken/$uid.
 */
async function createFirebaseAccount(linkedinID, displayName, photoURL, email, accessToken) {
  const uid = `linkedin:${linkedinID}`;

  const databaseTask = getDatabase().ref(`/linkedInAccessToken/${uid}`).set(accessToken);

  const userCreationTask = getAuth().updateUser(uid, {
    displayName: displayName,
    photoURL: photoURL,
    email: email,
    emailVerified: true,
  }).catch((error) => {
    if (error.code === 'auth/user-not-found') {
      return getAuth().createUser({
        uid: uid,
        displayName: displayName,
        photoURL: photoURL,
        email: email,
        emailVerified: true,
      });
    }
    throw error;
  });

  await Promise.all([userCreationTask, databaseTask]);
  const token = await getAuth().createCustomToken(uid);
  console.log('Created Custom token for UID "', uid, '"');
  return token;
}
