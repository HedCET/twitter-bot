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

  favourites: {
    required: true,
    type: Number,
  },

  favourites_avg: {
    type: Number,
  },

  favourites_ref: {
    type: Number,
  },

  favourites_ref_updated_at: {
    type: Date,
  },

  favourites_updated_at: {
    required: true,
    type: Date,
  },
});
