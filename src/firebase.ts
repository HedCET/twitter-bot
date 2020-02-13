import * as firebase from 'firebase-admin';

import { env } from './env.validations';

firebase.initializeApp({
  credential: firebase.credential.cert({
    clientEmail: env['FIREBASE_CLIENT_EMAIL'],
    privateKey: env['FIREBASE_PRIVATE_KEY'].replace(/\\n/g, '\n'),
    projectId: env['FIREBASE_PROJECT_ID'],
  }),
  databaseURL: 'https://kandamkori.firebaseio.com',
});

export const db = firebase.database();
