export interface search_res_statuses {
  created_at: string;
  full_text: string;
  id_str: string;
  user: {
    created_at: string;
    favourites_count: number;
    followers_count: number;
    friends_count: number;
    listed_count: number;
    screen_name: string;
    statuses_count: number;
  };
}

export interface search_res {
  data: {
    statuses: search_res_statuses[];
  };
}

export interface search_req {
  count: number;
  lang: string;
  max_id?: string;
  q: string;
  result_type: string;
  tweet_mode: string;
}
