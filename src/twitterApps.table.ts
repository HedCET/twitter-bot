import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ versionKey: false })
export class TwitterApp {
  @Prop()
  _id: String;

  @Prop({ required: true })
  consumerKey: String;

  @Prop({ required: true })
  consumerSecret: String;

  @Prop()
  deleted?: Boolean;

  @Prop()
  tag?: String;
}

export type TwitterAppDocument = TwitterApp & Document;
export const TwitterAppSchema = SchemaFactory.createForClass(TwitterApp);
