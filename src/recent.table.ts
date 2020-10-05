import { Document, Schema } from 'mongoose';

// table model
export interface model extends Document {
  _id: String;
}

// table name
export const name = 'recent';

// table schema
export const schema = new Schema(
  { _id: String },
  { collection: name, versionKey: false },
);
