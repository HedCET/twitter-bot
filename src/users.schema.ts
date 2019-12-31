import { Schema } from 'mongoose';

export const usersSchema = new Schema({
  _id: {
    required: true,
    type: String,
  },

  blocked: {
    type: Boolean,
  },

  favourites: {
    required: true,
    type: Number,
  },

  favourites_ref: {
    type: Number,
  },

  last_tweet_time: {
    required: true,
    type: Date,
  },

  last_tweet_time_ref: {
    type: Date,
  },
});
