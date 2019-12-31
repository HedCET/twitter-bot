export interface search_tweets_meta {
  max_id_str: string,
}

export interface search_tweets_statuses {
  created_at: string,
  id_str: string,
  user: {
    favourites_count: number,
    screen_name: string,
  },
}

export interface search_tweets {
  data: {
    search_metadata: search_tweets_meta,
    statuses: search_tweets_statuses[],
  },
}
