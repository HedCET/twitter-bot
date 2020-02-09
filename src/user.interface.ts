import { db } from 'dist/firebase';

export interface userInterface {
  blocked?: boolean;
  created_at: number;
  favourites?: number;
  followers?: number;
  friends?: number;
  last_favourites_average?: number;
  last_followers_average?: number;
  last_friends_average?: number;
  last_tweeted_at_frequency?: number;
  tweeted_at: number;
}
