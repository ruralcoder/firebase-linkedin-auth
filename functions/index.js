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

const functions = require('firebase-functions');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');

// Firebase Setup
const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json');

const request = require('request');


admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: `https://${process.env.GCLOUD_PROJECT}.firebaseio.com`,
});

const OAUTH_SCOPES = ['r_liteprofile', 'r_emailaddress'];

/**
 * Creates a configured LinkedIn API Client instance.
 */
function linkedInClient() {
  // LinkedIn OAuth 2 setup
  // TODO: Configure the `linkedin.client_id` and `linkedin.client_secret` Google Cloud environment variables.
  return require('node-linkedin')(
      functions.config().linkedin.client_id,
      functions.config().linkedin.client_secret,
      `https://${process.env.GCLOUD_PROJECT}.firebaseapp.com/popup.html`);
}


function getFullname(profileObject) {

    console.info("getFullname: ", profileObject)

  // { firstName: 
  //    { localized: { en_US: 'Stephen' },
  //      preferredLocale: { country: 'US', language: 'en' } },
  //   lastName: 
  //    { localized: { en_US: 'Anderson' },
  //      preferredLocale: { country: 'US', language: 'en' } },
  //   profilePicture: 
  //    { displayImage: 'urn:li:digitalmediaAsset:C5603AQHpClibLq7hLw',
  //      'displayImage~': { paging: [Object], elements: [Array] } },
  //   id: 'RST39CgsmW' }

    console.assert("firstName" in profileObject, "Missing key firstName from profileObject")
    console.assert("lastName" in profileObject, "Missing key lastName from profileObject")

    let firstLocale = profileObject.firstName.preferredLocale
    const firstPreferred = `${firstLocale.language}_${firstLocale.country}`;
    const first = profileObject.firstName.localized[firstPreferred];

    let lastLocale = profileObject.lastName.preferredLocale
    const lastPreferred = `${lastLocale.language}_${lastLocale.country}`;
    const last = profileObject.lastName.localized[lastPreferred];

    return `${first} ${last}`;
}

function isRealValue(obj) {
  return obj && obj !== 'null' && obj !== 'undefined';
}


function getEmailAddress(emailObject) {

  //{"elements":[{"handle~":{"emailAddress":"ruralcoder@gmail.com"},"handle":"urn:li:emailAddress:134932169"}]}

  console.assert(isRealValue(emailObject), "emailObject is null")
  console.assert("elements" in emailObject, "Missing key elements from emailObject")

  let element = emailObject.elements[0]
  console.assert(isRealValue(element), "element is null")

  console.assert("handle~" in element, "Missing key handle~ from element")
  let handle = element["handle~"]
  console.assert(isRealValue(handle), "handle is null")

  console.assert("emailAddress" in handle, "Missing key emailAddress from handle")

  return handle.emailAddress
}



/**
* Extract the photo URL from LinkedIn's payload
*/
function extractPhotoUrl(photoObject) {
    // {"profilePicture":{"displayImage":"urn:li:digitalmediaAsset:C5603AQHpClibLq7hLw","displayImage~":{"paging":{"count":10,"start":0,"links":[]},"elements":[{"artifact":"urn:li:digitalmediaMediaArtifact:(urn:li:digitalmediaAsset:C5603AQHpClibLq7hLw,urn:li:digitalmediaMediaArtifactClass:profile-displayphoto-shrink_100_100)","authorizationMethod":"PUBLIC","data":{"com.linkedin.digitalmedia.mediaartifact.StillImage":{"storageSize":{"width":100,"height":100},"storageAspectRatio":{"widthAspect":1.0,"heightAspect":1.0,"formatted":"1.00:1.00"},"mediaType":"image/jpeg","rawCodecSpec":{"name":"jpeg","type":"image"},"displaySize":{"uom":"PX","width":100.0,"height":100.0},"displayAspectRatio":{"widthAspect":1.0,"heightAspect":1.0,"formatted":"1.00:1.00"}}},"identifiers":[{"identifier":"https://media.licdn.com/dms/image/C5603AQHpClibLq7hLw/profile-displayphoto-shrink_100_100/0?e=1571875200&v=beta&t=DGLXoAVmGmZ4UXkSjFOMum_yI1KEFvMoB52n21WJfG4","file":"urn:li:digitalmediaFile:(urn:li:digitalmediaAsset:C5603AQHpClibLq7hLw,urn:li:digitalmediaMediaArtifactClass:profile-displayphoto-shrink_100_100,0)","index":0,"mediaType":"image/jpeg","identifierType":"EXTERNAL_URL","identifierExpiresInSeconds":1571875200}]},{"artifact":"urn:li:digitalmediaMediaArtifact:(urn:li:digitalmediaAsset:C5603AQHpClibLq7hLw,urn:li:digitalmediaMediaArtifactClass:profile-displayphoto-shrink_200_200)","authorizationMethod":"PUBLIC","data":{"com.linkedin.digitalmedia.mediaartifact.StillImage":{"storageSize":{"width":200,"height":200},"storageAspectRatio":{"widthAspect":1.0,"heightAspect":1.0,"formatted":"1.00:1.00"},"mediaType":"image/jpeg","rawCodecSpec":{"name":"jpeg","type":"image"},"displaySize":{"uom":"PX","width":200.0,"height":200.0},"displayAspectRatio":{"widthAspect":1.0,"heightAspect":1.0,"formatted":"1.00:1.00"}}},"identifiers":[{"identifier":"https://media.licdn.com/dms/image/C5603AQHpClibLq7hLw/profile-displayphoto-shrink_200_200/0?e=1571875200&v=beta&t=Ziud4Lb-F2g6sm6BdbwRMWU-8i9fRLY6jJqw9mpueYU","file":"urn:li:digitalmediaFile:(urn:li:digitalmediaAsset:C5603AQHpClibLq7hLw,urn:li:digitalmediaMediaArtifactClass:profile-displayphoto-shrink_200_200,0)","index":0,"mediaType":"image/jpeg","identifierType":"EXTERNAL_URL","identifierExpiresInSeconds":1571875200}]},{"artifact":"urn:li:digitalmediaMediaArtifact:(urn:li:digitalmediaAsset:C5603AQHpClibLq7hLw,urn:li:digitalmediaMediaArtifactClass:profile-displayphoto-shrink_400_400)","authorizationMethod":"PUBLIC","data":{"com.linkedin.digitalmedia.mediaartifact.StillImage":{"storageSize":{"width":400,"height":400},"storageAspectRatio":{"widthAspect":1.0,"heightAspect":1.0,"formatted":"1.00:1.00"},"mediaType":"image/jpeg","rawCodecSpec":{"name":"jpeg","type":"image"},"displaySize":{"uom":"PX","width":400.0,"height":400.0},"displayAspectRatio":{"widthAspect":1.0,"heightAspect":1.0,"formatted":"1.00:1.00"}}},"identifiers":[{"identifier":"https://media.licdn.com/dms/image/C5603AQHpClibLq7hLw/profile-displayphoto-shrink_400_400/0?e=1571875200&v=beta&t=rdQqf46Mo6c-I2jc1BuIZ8h4fBo3WgBl6IafWH5TFq8","file":"urn:li:digitalmediaFile:(urn:li:digitalmediaAsset:C5603AQHpClibLq7hLw,urn:li:digitalmediaMediaArtifactClass:profile-displayphoto-shrink_400_400,0)","index":0,"mediaType":"image/jpeg","identifierType":"EXTERNAL_URL","identifierExpiresInSeconds":1571875200}]},{"artifact":"urn:li:digitalmediaMediaArtifact:(urn:li:digitalmediaAsset:C5603AQHpClibLq7hLw,urn:li:digitalmediaMediaArtifactClass:profile-displayphoto-shrink_800_800)","authorizationMethod":"PUBLIC","data":{"com.linkedin.digitalmedia.mediaartifact.StillImage":{"storageSize":{"width":800,"height":800},"storageAspectRatio":{"widthAspect":1.0,"heightAspect":1.0,"formatted":"1.00:1.00"},"mediaType":"image/jpeg","rawCodecSpec":{"name":"jpeg","type":"image"},"displaySize":{"uom":"PX","width":800.0,"height":800.0},"displayAspectRatio":{"widthAspect":1.0,"heightAspect":1.0,"formatted":"1.00:1.00"}}},"identifiers":[{"identifier":"https://media.licdn.com/dms/image/C5603AQHpClibLq7hLw/profile-displayphoto-shrink_800_800/0?e=1571875200&v=beta&t=xs9FgLbNGDx_TLCr7XqfROszDmnQ0o153SgCTHCFPeM","file":"urn:li:digitalmediaFile:(urn:li:digitalmediaAsset:C5603AQHpClibLq7hLw,urn:li:digitalmediaMediaArtifactClass:profile-displayphoto-shrink_800_800,0)","index":0,"mediaType":"image/jpeg","identifierType":"EXTERNAL_URL","identifierExpiresInSeconds":1571875200}]}]}},"id":"RST39CgsmW"}

    console.assert(isRealValue(photoObject), "photoObject is null")

    console.assert("profilePicture" in photoObject, "Missing key profilePicture from photoObject")
    let profilePicture = photoObject.profilePicture

    console.assert("profilePicture" in photoObject, "Missing key displayImage~ from profilePicture")
    let displayImage = profilePicture["displayImage~"]

    console.assert("elements" in displayImage, "Missing key elements from photoObject")

    var photoUrl
    for (let element of displayImage.elements) {
      
      console.assert("artifact" in element, "Missing key artifact from elements")
      
      if (!element.artifact.includes("profile-displayphoto-shrink_400_400")) {
        continue
      }

      console.assert("identifiers" in element, "Missing key identifiers from elements")
      console.assert("identifier" in element.identifiers[0], "Missing key identifier from identifiers")

      return element.identifiers[0].identifier
    }
}


/**
 * Redirects the User to the LinkedIn authentication consent screen. ALso the 'state' cookie is set for later state
 * verification.
 */
exports.redirect = functions.https.onRequest((req, res) => {
  const Linkedin = linkedInClient();

  cookieParser()(req, res, () => {
    const state = req.cookies.state || crypto.randomBytes(20).toString('hex');
    
    console.log('Setting verification state:', state);
    
    res.cookie('state', state.toString(), {
      maxAge: 3600000,
      secure: true,
      httpOnly: true,
    });
    Linkedin.auth.authorize(res, OAUTH_SCOPES, state.toString());
  });
});

/**
 * Exchanges a given LinkedIn auth code passed in the 'code' URL query parameter for a Firebase auth token.
 * The request also needs to specify a 'state' query parameter which will be checked against the 'state' cookie.
 * The Firebase custom auth token is sent back in a JSONP callback function with function name defined by the
 * 'callback' query parameter.
 */
exports.token = functions.https.onRequest((req, res) => {
  const Linkedin = linkedInClient();

  try {
    return cookieParser()(req, res, () => {

      if (!req.cookies.state) {
        console.error("State cookie not set or expired. Maybe you took too long to authorize. Please try again.")

        throw new Error('State cookie not set or expired. Maybe you took too long to authorize. Please try again.');
      }

      console.log('Received verification state:', req.cookies.state);
      
      Linkedin.auth.authorize(OAUTH_SCOPES, req.cookies.state); // Makes sure the state parameter is set
      
      console.log('Received auth code:', req.query.code);
      console.log('Received state:', req.query.state);
      
      Linkedin.auth.getAccessToken(res, req.query.code, req.query.state, (error, results) => {

        if (error) {
          throw error;
        }

        let linkedInAccessToken = results.access_token

        console.log('Received Access Token:', linkedInAccessToken);

        const linkedin = Linkedin.init(results.access_token);

        linkedin.people.me(async (error, profileObject) => {

          if (error) {
            console.error("Error: linkedin.people.me: ", error)
            throw error;
          }

          console.log('Auth code exchange result received:', profileObject);

          let userUID = profileObject.id;
          let fullname = getFullname(profileObject)

          const emailEndpoint = {
            url: 'https://api.linkedin.com/v2/emailAddress?q=members&projection=(elements*(handle~))',
            headers: {
              'Authorization': `Bearer ${linkedInAccessToken}`
            },
            json:true
          };

          console.info("==> Fetch email");

          request(emailEndpoint, function (error, response, emailObject) {
            
              console.error('error:', error); // Print the error if one occurred
              console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
              console.log('body:', emailObject); // Print the HTML for the Google homepage.


              if (error) {
                console.info("LinkedIn GET: ", error);
                return
              }

              let emailAddress = getEmailAddress(emailObject);
              console.info("emailAddress: ", emailAddress);

              const photoEndpoint = {
                url: 'https://api.linkedin.com/v2/me?projection=(id,profilePicture(displayImage~:playableStreams))',
                headers: {
                  'Authorization': `Bearer ${linkedInAccessToken}`
                },
                json:true
              };

              console.info("==> Fetch photo");

              request(photoEndpoint, async function (error, response, photoObject) {
              
                console.error('error:', error); // Print the error if one occurred
                console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
                console.log('body:', photoObject); // Print the HTML for the Google homepage.

                if (error) {
                  console.info("LinkedIn GET: ", error);
                  return
                }

                let photoUrl = extractPhotoUrl(photoObject)
                console.info("photoUrl: ", photoUrl);


                // We have a LinkedIn access token and the user identity now.
                // Create a Firebase account and get the Custom Auth Token.
                const firebaseToken = await createFirebaseAccount(userUID, fullname, photoUrl, emailAddress, results.access_token);
                
                // Serve an HTML page that signs the user in and updates the user profile.
                res.jsonp({
                  token: firebaseToken,
                });            
          })
            
        })

        });
      });
    });

  } catch (error) {
    return res.jsonp({ error: error.toString });
  }
});

/**
 * Creates a Firebase account with the given user profile and returns a custom auth token allowing
 * signing-in this account.
 * Also saves the accessToken to the datastore at /linkedInAccessToken/$uid
 *
 * @returns {Promise<string>} The Firebase custom auth token in a promise.
 */
async function createFirebaseAccount(linkedinID, displayName, photoURL, email, accessToken) {
  // The UID we'll assign to the user.
  const uid = `linkedin:${linkedinID}`;

  // Save the access token tot he Firebase Realtime Database.
  const databaseTask = admin.database().ref(`/linkedInAccessToken/${uid}`).set(accessToken);

  // Create or update the user account.
  const userCreationTask = admin.auth().updateUser(uid, {
    displayName: displayName,
    photoURL: photoURL,
    email: email,
    emailVerified: true,
  }).catch((error) => {
    // If user does not exists we create it.
    if (error.code === 'auth/user-not-found') {
      return admin.auth().createUser({
        uid: uid,
        displayName: displayName,
        photoURL: photoURL,
        email: email,
        emailVerified: true,
      });
    }
    throw error;
  });

  // Wait for all async task to complete then generate and return a custom auth token.
  await Promise.all([userCreationTask, databaseTask]);
  // Create a Firebase custom auth token.
  const token = await admin.auth().createCustomToken(uid);
  console.log('Created Custom token for UID "', uid, '" Token:', token);
  return token;
}
