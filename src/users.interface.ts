import { Document } from 'mongoose';

export interface usersInterface extends Document {
  _id: String,
  blocked?: Boolean,
  favourites: Number,
  favourites_ref?: Number,
  last_tweet_time: Date,
  last_tweet_time_ref?: Date,
}
