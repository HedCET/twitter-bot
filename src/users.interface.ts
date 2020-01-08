import { Document } from 'mongoose';

export interface usersInterface extends Document {
  _id: String,
  blocked?: Boolean,
  created_at: Date,
  favourites: Number,
  favourites_index?: Number,
  favourites_ref?: Number,
  favourites_ref_updated_at?: Date,
  favourites_updated_at: Date,
}
