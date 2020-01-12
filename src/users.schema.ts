import { Schema } from 'mongoose';

export const usersSchema = new Schema({
  _id: { required: true, type: String },
  blocked: Boolean,
  created_at: { required: true, type: Date },
  favourites: { required: true, type: Number },
  recent_favourites_average: Number,
  recent_tweeted_at_frequency: Number,
  tweeted_at: { required: true, type: Date },
});
