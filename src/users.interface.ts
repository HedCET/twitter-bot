import { Document } from 'mongoose';

export interface usersInterface extends Document {
  _id: String,
  blocked?: Boolean,
  created_at: Date,
  favourites: Number,
  recent_favourites_average?: Number,
  recent_tweeted_at_frequency?: Number,
  tweeted_at: Date,
}
