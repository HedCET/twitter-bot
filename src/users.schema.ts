import { Schema } from 'mongoose';

export const usersSchema = new Schema({
  _id: { required: true, type: String },
  blocked: Boolean,
  created_at: { required: true, type: Date },
  favourites: Number,
  followers: Number,
  friends: Number,
  last_favourites_average: Number,
  last_followers_average: Number,
  last_friends_average: Number,
  last_tweeted_at_frequency: Number,
  profile_image_path: String,
  tweeted_at: { required: true, type: Date },
});
