import { Document } from 'mongoose';

export interface usersModel extends Document {
  _id: String;
  access_token?: String;
  access_token_secret?: String;
  access_token_validated_at?: Date;
  blocked?: Boolean;
  created_at: Date;
  favourites?: Number;
  followers?: Number;
  friends?: Number;
  last_favourites_average?: Number;
  last_followers_average?: Number;
  last_friends_average?: Number;
  last_lists_average?: Number;
  last_tweeted_at_frequency?: Number;
  lists?: Number;
  roles?: String[];
  tweeted_at: Date;
  tweets?: Number;
}
