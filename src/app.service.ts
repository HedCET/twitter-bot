import {
  CACHE_MANAGER,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import * as BigInt from 'big-integer';
import { each, find, pick, random, sortBy } from 'lodash';
import * as moment from 'moment';
import { Model } from 'mongoose';
import * as twit from 'twit';
import { isJSON } from 'validator';

import { AmqpService } from './amqp.service';
import { modelTokens } from './db.models';
import { env } from './env.validations';
import { MessageService } from './message.service';
import { tweetsModel } from './tweets.model';
import { search_req, search_res } from './twitter.interface';
import { usersModel } from './users.model';

@Injectable()
export class AppService {
  private WORDART_INDEX = random(env.WORDART_IMAGE_URLS.split('|').length);
  private readonly WORDART_SERVICES = [
    'favourites',
    'followers',
    'friends',
    'lists',
    'tweeted_at',
  ];

  constructor(
    private readonly amqpService: AmqpService,
    @Inject(CACHE_MANAGER) private readonly cacheManager,
    private readonly logger: Logger,
    private readonly messageService: MessageService,
    @InjectModel(modelTokens.tweets)
    private readonly tweetsModel: Model<tweetsModel>,
    @InjectModel(modelTokens.users)
    private readonly usersModel: Model<usersModel>,
  ) {}

  // twitter handler
  @Cron('0 0,10,20,30,40,50 * * * *')
  async update() {
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
          'AppService/update',
        );
        await this.usersModel.updateOne({ _id }, { $set: { blocked: true } }); // block & recursive
        return this.update();
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
            'AppService/update',
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
    } else throw new NotFoundException();
  }

  // populate wordart in cache
  @Cron('0 5,15,25,35,45,55 * * * *')
  async _wordart(key: string = '') {
    if (!key)
      for (const service of this.WORDART_SERVICES) await this._wordart(service);

    if (-1 < this.WORDART_SERVICES.indexOf(key)) {
      const data = { startAt: moment().toDate(), tweeters: [], wordArt: {} };

      // iterate max 30 times & at-least 10 tweeters
      for (let i = 0; data.tweeters.length < 10 && i < 30; i++) {
        data.startAt = moment(data.startAt)
          .subtract((i + 1) * 10, 'minutes')
          .toDate();

        const prop = `last_${key}_${
          key == 'tweeted_at' ? 'frequency' : 'average'
        }`;

        // dynamic projection
        const users = await this.usersModel.find(
          { tweeted_at: { $gte: data.startAt } },
          { _id: 1, [prop]: 1 },
          { sort: { tweeted_at: 'desc' } },
        );

        for (const user of users)
          if (0 < user[prop] && !find(data.tweeters, { key: user._id }))
            data.tweeters.push({ key: user._id, value: Math.ceil(user[prop]) });
      }

      if (data.tweeters.length) {
        let content;

        try {
          content = (
            await this.amqpService.request(
              {},
              {
                sendOpts: {
                  headers: {
                    // randomizing images
                    image: env.WORDART_IMAGE_URLS.split('|')[
                      this.WORDART_INDEX++ %
                        env.WORDART_IMAGE_URLS.split('|').length
                    ],
                    // words in csv format
                    words: data.tweeters
                      .map(item => `${item.key};${item.value}`)
                      .join('\n'),
                  },
                },
              },
            )
          ).content.toString();
        } catch (e) {
          this.logger.error(e, e.message, `AppService/${key}`);
        }

        if (content) {
          if (isJSON(content)) {
            const json = JSON.parse(content);

            this.logger.log(
              pick(json, ['statusCode', 'statusText']),
              `AppService/${key}`,
            );

            if (json.statusCode == 200) {
              data.wordArt = json.response;

              // custom caching
              this.cacheManager.set(
                '_wordart',
                {
                  ...((await this.cacheManager.get('_wordart')) || {}),
                  [key]: data,
                },
                { ttl: 0 }, // infinitely
              );
            } else await this._wordart(key);
          } else
            this.logger.error(
              content,
              'invalid JSON response.content',
              `AppService/${key}`,
            );
        }
      }
    }

    return (await this.cacheManager.get('_wordart')) || {};
  }

  // wordart route handler
  async wordart(key: string = '') {
    // custom cache handler
    let _wordart = await this.cacheManager.get('_wordart');
    if (!_wordart) _wordart = await this._wordart();

    if (key && -1 < this.WORDART_SERVICES.indexOf(key) && _wordart[key])
      return _wordart[key].wordArt;
    else {
      const json = {};

      // metadata response
      each(pick(_wordart, this.WORDART_SERVICES), (value, key) => {
        json[key] = {
          hits: value.tweeters.map(tweeter => tweeter.key),
          startAt: value.startAt,
        };
      });

      return json;
    }
  }

  // search route handler
  async search(query: string = '') {
    const _id = new RegExp(query, 'i');

    const hits = await this.usersModel.find(
      { _id },
      { _id: 1, tweeted_at: 1 },
      { limit: 10, sort: { tweeted_at: 'desc' } },
    );

    return {
      hits: hits.map(hit => hit._id),
      total:
        hits.length < 10
          ? hits.length
          : await this.usersModel.countDocuments({ _id }),
    };
  }
}
