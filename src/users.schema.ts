import { Schema } from 'mongoose';

export const usersSchema = new Schema({
  _id: { required: true, type: String },
  access_token: String,
  access_token_secret: String,
  access_token_validated_at: Date,
  blocked: Boolean,
  created_at: { required: true, type: Date },
  favourites: Number,
  followers: Number,
  friends: Number,
  last_favourites_average: Number,
  last_followers_average: Number,
  last_friends_average: Number,
  last_lists_average: Number,
  last_tweeted_at_frequency: Number,
  lists: Number,
  roles: [String],
  tweeted_at: { required: true, type: Date },
  tweets: Number,
});
