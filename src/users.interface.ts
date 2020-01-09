import { Document } from 'mongoose';

export interface usersInterface extends Document {
  _id: String,
  blocked?: Boolean,
  created_at: Date,
  earlier_tweeted_at?: Date,
  favourites: Number,
  favourites_avg?: Number,
  tweeted_at: Date,
}
