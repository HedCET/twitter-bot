import { Document } from 'mongoose';

export interface usersInterface extends Document {
  _id: String;
  blocked?: Boolean;
  created_at: Date;
  favourites?: Number;
  followers?: Number;
  friends?: Number;
  last_favourites_average?: Number;
  last_followers_average?: Number;
  last_friends_average?: Number;
  last_tweeted_at_frequency?: Number;
  tweeted_at: Date;
}
