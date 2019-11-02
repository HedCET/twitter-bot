import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { last, shuffle, sortBy } from 'lodash';
import { Model } from 'mongoose';
import * as twit from 'twit';

import { modelTokens } from './db.imports';
import { retweetsInterface } from './retweets,interface';

@Injectable()
export class AppService {
  private since_id: string;

  constructor(
    @Inject('TWITTER') private readonly twitter: typeof twit,
    @InjectModel(modelTokens.retweets) private readonly retweetsModel: Model<retweetsInterface>
  ) { }

  async update() {
    if (!this.since_id) {
      const lastTweet = await this.retweetsModel
        .where()
        .sort({ _id: 'desc' })
        .findOne();

      if (lastTweet) this.since_id = lastTweet._id;
      else {
        let looping: boolean = true;

        while (looping) {
          const query: { count: number, screen_name: string, since_id?: string }
            = { count: 200, screen_name: 'crawlamma' };

          if (this.since_id)
            query.since_id = this.since_id;

          const timeline: { data: { id: number, id_str: string }[] } = await this.twitter
            .get('statuses/user_timeline', query);

          if (timeline.data.length) {
            for (const tweet of timeline.data) {
              if (!await this.retweetsModel.where({ _id: tweet.id_str }).findOne())
                await new this.retweetsModel({ _id: tweet.id_str }).save();
            }

            this.since_id = last(sortBy(timeline.data, 'id')).id_str;
          } else looping = false;
        }

        const lastTweet = await this.retweetsModel
          .where()
          .sort({ _id: 'desc' })
          .findOne();

        this.since_id = (lastTweet ? lastTweet._id : 0);
      }
    }

    let looping: boolean = true;
    let i: number = 1;

    while (looping) {
      const tweets: { data: { search_metadata: { max_id_str: string }, statuses: { id_str: string, in_reply_to_status_id_str: string, quoted_status_id_str: string }[] } } = await this.twitter
        .get('search/tweets', { count: 100, lang: 'ml', q: '* AND -filter:replies AND -filter:retweets', result_type: 'recent', since_id: this.since_id });

      if (tweets.data.statuses.length) this.since_id = tweets.data.search_metadata.max_id_str;
      else looping = false;

      for (const tweet of shuffle(tweets.data.statuses)) {
        if (!tweet.in_reply_to_status_id_str
          && !tweet.quoted_status_id_str
          && !await this.retweetsModel.where({ _id: tweet.id_str }).findOne()) {
          if (5 < i++) {
            looping = false;
            break;
          } else {
            await new Promise(resolve => setTimeout(async () => {
              try {
                await this.twitter.post('statuses/retweet/:id', { id: tweet.id_str });
                await new this.retweetsModel({ _id: tweet.id_str }).save();
                Logger.log(i - 1, `retweet/${tweet.id_str}`);
              } catch (e) {
                Logger.log(e.message || e, `retweet/${tweet.id_str}`);

                if ((e.message || '').match(/ retweeted /i)) {
                  await new this.retweetsModel({ _id: tweet.id_str }).save();
                  i--;
                }
              }

              resolve(true);
            }, 1000 * 5));
          }
        }
      }
    }

    return { since_id: this.since_id };
  }
}
