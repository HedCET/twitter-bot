import { Schema } from 'mongoose';

export const usersSchema = new Schema({
  _id: {
    required: true,
    type: String,
  },

  blocked: {
    type: Boolean,
  },

  created_at: {
    required: true,
    type: Date,
  },

  earlier_tweeted_at: {
    type: Date,
  },

  favourites: {
    required: true,
    type: Number,
  },

  favourites_avg: {
    type: Number,
  },

  tweeted_at: {
    required: true,
    type: Date,
  },
});
