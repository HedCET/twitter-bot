import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import * as BigInt from 'big-integer';
import { sortBy } from 'lodash';
import * as moment from 'moment';
import { Model } from 'mongoose';
import * as twit from 'twit';

import { modelTokens } from './db.models';
import { env } from './env.validations';
import { MessageService } from './message.service';
import { tweetsModel } from './tweets.model';
import { search_req, search_res } from './twitter.interface';
import { usersModel } from './users.model';

@Injectable()
export class TwitterService {
  constructor(
    private readonly logger: Logger,
    private readonly messageService: MessageService,
    @InjectModel(modelTokens.tweets)
    private readonly tweetsModel: Model<tweetsModel>,
    @InjectModel(modelTokens.users)
    private readonly usersModel: Model<usersModel>,
  ) {}

  // twitter scheduler
  @Cron('0 0,10,20,30,40,50 * * * *')
  private async scheduler() {
    const {
      _id,
      access_token,
      access_token_secret,
    } = await this.usersModel.findOne(
      {
        access_token: { $exists: true },
        access_token_secret: { $exists: true },
        blocked: { $ne: true },
      },
      {
        _id: 1,
        access_token: 1,
        access_token_secret: 1,
      },
      { sort: { access_token_validated_at: 'asc' } },
    );

    if (_id) {
      // update access_token_validated_at only here in entire repo
      await this.usersModel.updateOne(
        { _id },
        { $set: { access_token_validated_at: moment().toDate() } },
      );

      const twitter = new twit({
        access_token,
        access_token_secret,
        consumer_key: env.TWITTER_CONSUMER_KEY,
        consumer_secret: env.TWITTER_CONSUMER_SECRET,
        strictSSL: true,
        timeout_ms: 60 * 1000,
      });

      try {
        // account/verify_credentials
        await twitter.get('account/verify_credentials', {
          skip_status: true,
        });
      } catch (error) {
        this.logger.error(
          { _id, error },
          'account/verify_credentials',
          'TwitterService/scheduler',
        );
        await this.usersModel.updateOne({ _id }, { $set: { blocked: true } }); // block & recursive
        return this.scheduler();
      }

      for (let i = 0, maxId; i < 30; i++) {
        const query: search_req = {
          count: 100,
          lang: 'ml',
          q: '*',
          result_type: 'recent',
          tweet_mode: 'extended',
        };

        // limit 100 & skip till maxId
        if (maxId) query.max_id = maxId;

        const tweets: search_res = await twitter.get('search/tweets', query);

        // break if no status
        if (!tweets.data.statuses.length) break;

        // ascending sort
        const statuses = sortBy(tweets.data.statuses, [
          item =>
            `${moment(item.created_at, ['ddd MMM D HH:mm:ss ZZ YYYY']).format(
              'x',
            )}.${item.id_str}`,
        ]);

        // set maxId for next iteration
        maxId = BigInt(statuses[0].id_str)
          .subtract(1)
          .toString();

        // new tweets counter
        let newTweets = 0;

        for (const status of statuses) {
          const created_at = moment(status.user.created_at, [
            'ddd MMM D HH:mm:ss ZZ YYYY',
          ]).toDate();
          const tweeted_at = moment(status.created_at, [
            'ddd MMM D HH:mm:ss ZZ YYYY',
          ]).toDate();

          const $set: { [key: string]: any } = { created_at, tweeted_at };
          const $unset: { [key: string]: any } = {};

          // favourites
          if (status.user.favourites_count)
            $set.favourites = status.user.favourites_count;
          else $unset.favourites = true;

          // followers
          if (status.user.followers_count)
            $set.followers = status.user.followers_count;
          else $unset.followers = true;

          // friends
          if (status.user.friends_count)
            $set.friends = status.user.friends_count;
          else $unset.friends = true;

          // lists
          if (status.user.listed_count) $set.lists = status.user.listed_count;
          else $unset.lists = true;

          // tweets
          if (status.user.statuses_count)
            $set.tweets = status.user.statuses_count;
          else $unset.tweets = true;

          const user = await this.usersModel.findOne({
            _id: status.user.screen_name,
          });

          if (user && moment(tweeted_at).isAfter(user.tweeted_at)) {
            $set.last_tweeted_at_frequency = moment
              .duration(moment(tweeted_at).diff(user.tweeted_at))
              .asDays();

            // average favourites per day
            if (
              user.favourites &&
              status.user.favourites_count != user.favourites
            )
              $set.last_favourites_average =
                (status.user.favourites_count - user.favourites) /
                $set.last_tweeted_at_frequency;

            // average followers per day
            if (user.followers && status.user.followers_count != user.followers)
              $set.last_followers_average =
                (status.user.followers_count - user.followers) /
                $set.last_tweeted_at_frequency;

            // average friends per day
            if (user.friends && status.user.friends_count != user.friends)
              $set.last_friends_average =
                (status.user.friends_count - user.friends) /
                $set.last_tweeted_at_frequency;

            // average lists per day
            if (user.lists && status.user.listed_count != user.lists)
              $set.last_lists_average =
                (status.user.listed_count - user.lists) /
                $set.last_tweeted_at_frequency;
          }

          this.logger.log(
            { i: i + 1, [status.user.screen_name]: { ...$set } },
            'TwitterService/scheduler',
          );

          // upsert
          await this.usersModel.updateOne(
            { _id: status.user.screen_name },
            { $set, $unset },
            { upsert: true },
          );

          const tweet = await this.tweetsModel.findOne({
            _id: status.id_str,
          });

          if (!tweet) {
            await new this.tweetsModel({ _id: status.id_str }).save();
            newTweets++;
            this.messageService.addMessage(status); // publish to RxJS message stream
          }
        }

        // no newTweets break
        if (!newTweets) break;

        // wait before next iteration
        await new Promise(r => setTimeout(r, 1000 * 10));
      }

      const thresholdTweet = await this.tweetsModel.findOne(
        {},
        { _id: 1 },
        { skip: 100000, sort: { _id: 'desc' } },
      );

      if (thresholdTweet)
        await this.tweetsModel.deleteMany({
          _id: { $lte: thresholdTweet._id },
        });

      return true;
    }
  }
}
