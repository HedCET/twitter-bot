export interface searchQuery {
  count: number;
  lang: string;
  max_id?: string;
  q: string;
  result_type: string;
  tweet_mode: string;
}

export interface tweeterInterface {
  created_at: string;
  favourites_count: number;
  followers_count: number;
  friends_count: number;
  id_str: string;
  listed_count: number;
  screen_name: string;
  statuses_count: number;
}

export interface tweetInterface {
  created_at: string;
  full_text: string;
  id_str: string;
  user: tweeterInterface;
}
