import { Document } from 'mongoose';

export interface settingsInterface extends Document {
  _id: String,
  since_id?: String,
}
