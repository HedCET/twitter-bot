import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ versionKey: false })
export class Recent {
  @Prop({ required: true })
  _id: String;

  @Prop()
  json: String;

  @Prop({ required: true })
  startedAt: Date;

  @Prop([String])
  tweeters: String[];
}

export type RecentDocument = Recent & Document;
export const RecentSchema = SchemaFactory.createForClass(Recent);
