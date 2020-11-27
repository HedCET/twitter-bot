import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ versionKey: false })
export class Recent {
  @Prop()
  _id: String;
}

export type RecentDocument = Recent & Document;
export const RecentSchema = SchemaFactory.createForClass(Recent);
