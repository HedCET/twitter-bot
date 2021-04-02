export interface searchParams {
  count: number;
  lang: string;
  max_id?: string;
  q: string;
  result_type: string;
  tweet_mode: string;
}

export interface tweeterInterface {
  created_at: string;
  description: string;
  favourites_count: number;
  followers_count: number;
  following: boolean;
  friends_count: number;
  id_str: string;
  listed_count: number;
  name: string;
  screen_name: string;
  statuses_count: number;
}

export interface tweetInterface {
  created_at: string;
  full_text: string;
  id_str: string;
  entities?: any;
  user: tweeterInterface;
}

export interface friendsParams {
  count: number;
  cursor: string;
  skip_status: boolean;
}
