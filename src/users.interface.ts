import { Document } from 'mongoose';

export interface usersInterface extends Document {
  _id: String,
  created_at: Date,
  favourites: Number,
  favourites_ref?: Number,
  favourites_ref_updated_at?: Date,
  favourites_updated_at: Date,
}
