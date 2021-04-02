import { Document, Schema } from 'mongoose';

// table model
export interface model extends Document {
  _id: String;
  value: String;
}

// table name
export const name = 'settings';

// table schema
export const schema = new Schema(
  { _id: String, value: String },
  { collection: name, versionKey: false },
);
