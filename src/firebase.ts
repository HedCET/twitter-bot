import * as firebase from 'firebase-admin';

firebase.initializeApp({
  credential: firebase.credential.cert(require('../serviceAccount.json')),
  databaseURL: 'https://linto-1.firebaseio.com',
});

export const db = firebase.database();
