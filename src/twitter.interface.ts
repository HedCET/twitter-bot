export interface search_res_statuses {
  created_at: string,
  id_str: string,
  user: {
    created_at: string,
    favourites_count: number,
    followers_count: number,
    friends_count: number,
    screen_name: string,
  },
}

export interface search_res {
  data: {
    statuses: search_res_statuses[],
  },
}

export interface search_req {
  count: number,
  lang: string,
  q: string,
  result_type: string,
  max_id?: string,
}
