import { Schema } from 'mongoose';

export const usersSchema = new Schema(
  {
    _id: { required: true, type: String },
    accessRevoked: Boolean,
    accessTokenKey: String,
    accessTokenSecret: String,
    accessTokenValidatedAt: Date,
    averageFollowers: Number,
    averageFriends: Number,
    averageLikes: Number,
    averageLists: Number,
    createdAt: Date,
    followers: Number,
    friends: Number,
    likes: Number,
    lists: Number,
    name: { index: true, type: String },
    roles: [String],
    tweetedAt: Date,
    tweetFrequency: Number,
    tweets: Number,
  },
  { versionKey: false },
);
