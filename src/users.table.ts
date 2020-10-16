import { Document, Schema } from 'mongoose';

import { name as twitterAppsRef } from './twitterApps.table';

// private appProps
export const appProps = [
  'accessRevoked',
  'accessTokenKey',
  'accessTokenSecret',
  'blockedTimeout',
  'roles',
  'twitterApp',
];

// table model
export interface model extends Document {
  _id: String;
  accessRevoked?: Boolean;
  accessTokenKey?: String;
  accessTokenSecret?: String;
  averageFollowers?: Number;
  averageFriends?: Number;
  averageLikes?: Number;
  averageLists?: Number;
  blockedTimeout?: Date;
  createdAt?: Date;
  followers?: Number;
  friends?: Number;
  likes?: Number;
  lists?: Number;
  name: String;
  roles?: String[];
  tags?: String[];
  tweetedAt?: Date;
  tweetFrequency?: Number;
  tweets?: Number;
  twitterApp?: String;
}

// table name
export const name = 'users';

// table schema
export const schema = new Schema(
  {
    _id: String,
    accessRevoked: Boolean,
    accessTokenKey: String,
    accessTokenSecret: String,
    averageFollowers: Number,
    averageFriends: Number,
    averageLikes: Number,
    averageLists: Number,
    blockedTimeout: Date,
    createdAt: Date,
    followers: Number,
    friends: Number,
    likes: Number,
    lists: Number,
    name: { index: true, required: true, type: String },
    roles: [String],
    tags: [String],
    tweetedAt: { index: true, type: Date },
    tweetFrequency: Number,
    tweets: Number,
    twitterApp: { ref: twitterAppsRef, type: String },
  },
  { collection: name, versionKey: false },
);
