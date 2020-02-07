import * as firebase from 'firebase-admin';

import { env } from './env.validations';

firebase.initializeApp({
  credential: firebase.credential.cert({
    clientEmail: env['FIREBASE_CLIENT_EMAIL'],
    privateKey: env['FIREBASE_PRIVATE_KEY'],
    projectId: env['FIREBASE_PROJECT_ID'],
  }),
  databaseURL: 'https://linto-1.firebaseio.com',
});

export const db = firebase.database();
