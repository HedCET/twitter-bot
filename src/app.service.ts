import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { last, sortBy, uniqBy } from 'lodash';
import { Model } from 'mongoose';
import * as twit from 'twit';

import { modelTokens } from './db.imports';
import { retweetsInterface } from './retweets,interface';

@Injectable()
export class AppService {
  private sinceId: string;

  constructor(
    @Inject('TWITTER') private readonly twitter: typeof twit,
    @InjectModel(modelTokens.retweets) private readonly retweetsModel: Model<retweetsInterface>
  ) { }

  async setSinceId(): Promise<string> {
    const lastTweet = await this.retweetsModel
      .where()
      .sort({ _id: 'desc' })
      .findOne();

    if (lastTweet) this.sinceId = lastTweet._id;
    else {
      let looping: boolean = true;

      while (looping) {
        const query: { count: number, screen_name: string, since_id?: string }
          = { count: 200, screen_name: 'crawlamma' };

        if (this.sinceId)
          query.since_id = this.sinceId;

        const timeline: { data: { id: number, id_str: string }[] } = await this.twitter
          .get('statuses/user_timeline', query);

        if (timeline.data.length) {
          for (const tweet of timeline.data) {
            if (!await this.retweetsModel.where({ _id: tweet.id_str }).findOne()) {
              const newTweet = new this.retweetsModel({ _id: tweet.id_str });
              await newTweet.save();
            }
          }

          this.sinceId = last(sortBy(timeline.data, 'id')).id_str;
        } else looping = false;
      }

      const lastTweet = await this.retweetsModel
        .where()
        .sort({ _id: 'desc' })
        .findOne();

      this.sinceId = (lastTweet ? lastTweet._id : 0);
    }

    return this.sinceId;
  }

  async update(): Promise<{ since_id: string }> {
    if (!this.sinceId) {
      Logger.log(await this.setSinceId(), 'since_id');
    }

    let looping: boolean = true;
    let i: number = 1;

    while (looping) {
      const tweets: { data: { search_metadata: { since_id_str: string }, statuses: { id_str: string, in_reply_to_status_id_str: string, quoted_status_id_str: string }[] } } = await this.twitter
        .get('search/tweets', { count: 10, lang: 'ml', q: '*', result_type: 'recent', since_id: this.sinceId });

      if (tweets.data.statuses.length) this.sinceId = tweets.data.search_metadata.since_id_str;
      else looping = false;

      for (const tweet of uniqBy(tweets.data.statuses, 'id_str')) {
        if (!tweet.in_reply_to_status_id_str
          && !tweet.quoted_status_id_str) {
          if (!await this.retweetsModel.where({ _id: tweet.id_str }).findOne()) {
            if (10 < i++) looping = false;
            else await new Promise(resolve =>
              setTimeout(async () => {
                try {
                  await this.twitter.post('statuses/retweet/:id', { id: tweet.id_str });
                  await new this.retweetsModel({ _id: tweet.id_str }).save();
                  Logger.log(i - 1, `retweet/${tweet.id_str}`);
                } catch (e) {
                  Logger.log(e, `retweet/${tweet.id_str}`);

                  if ((e.message || '').match(/ retweeted /i)) {
                    await new this.retweetsModel({ _id: tweet.id_str }).save();
                    i--;
                  }
                }

                resolve(true);
              }, 1000 * 3));
          }
        }
      }
    }

    return { since_id: this.sinceId };
  }
}
