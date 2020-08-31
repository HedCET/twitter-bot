import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { fromPairs, has, omit, sortBy } from 'lodash';
import * as moment from 'moment';
import { Model } from 'mongoose';
// import Twitter from 'twitter-lite';

import { scripts } from './scripts';
import {
  model as settingsModel,
  name as settingsToken,
} from './settings.table';
import { searchQuery, tweetInterface } from './twitter.interface';
import { model as usersModel, name as usersToken } from './users.table';

const Twitter = require('twitter-lite');

@Injectable()
export class TwitterService {
  private readonly appProps = [
    'accessRevoked',
    'accessTokenKey',
    'accessTokenSecret',
    'roles',
    'twitterApp',
  ];

  constructor(
    private readonly logger: Logger,
    @InjectModel(settingsToken)
    private readonly settingsTable: Model<settingsModel>,
    @InjectModel(usersToken) private readonly usersTable: Model<usersModel>,
  ) {}

  // scheduled search
  @Cron('0 */3 * * * *')
  private async search(query?: searchQuery) {
    // get executors
    (
      await this.usersTable
        .find({
          accessRevoked: { $ne: true },
          accessTokenKey: { $exists: true },
          accessTokenSecret: { $exists: true },
          twitterApp: { $exists: true },
        })
        .populate({ path: 'twitterApp', match: { deleted: { $ne: true } } })
    )
      .filter(executor => executor.twitterApp && scripts[executor.name])
      .forEach(async executor => {
        const {
          _id,
          accessTokenKey: access_token_key,
          accessTokenSecret: access_token_secret,
          twitterApp: {
            _id: twitterApp,
            consumerKey: consumer_key,
            consumerSecret: consumer_secret,
            tag,
          },
          name,
        } = executor;

        // executor namespace
        const ns = scripts[name]; // as ref

        ns.executor = executor;
        ns.client = new Twitter({
          access_token_key,
          access_token_secret,
          consumer_key,
          consumer_secret,
        });

        // verify credentials
        try {
          await ns.client.get('account/verify_credentials');
        } catch (e) {
          this.logger.error(
            e,
            'account/verify_credentials',
            `TwitterService/search/${name}`,
          );

          // accessRevoked
          await this.usersTable.updateOne(
            { _id },
            { $set: { accessRevoked: true } },
          );

          return;
        }

        // attach to parent
        if (typeof ns.searchQuery === 'string') {
          const parent = scripts[ns.searchQuery.split('.')[0]];

          if (parent) {
            if (parent.children) parent.children.push(ns);
            else parent.children = [ns];
          }

          return;
        }

        // wait +30s for children
        await new Promise(r => setTimeout(r, 1000 * 30));

        const requestQuery: searchQuery = {
          ...ns.searchQuery,
          ...(query || {}),
          since_id: (
            (await this.settingsTable.findOne({ _id: `${_id}|since_id` })) ||
            '|0'
          ).split('|')[1],
        };

        for (let i = 0; i < 36; i++) {
          const response: {
            _headers: { [key: string]: any };
            statuses: tweetInterface[];
          } = await ns.client.get('search/tweets', requestQuery);

          this.logger.log(
            `remaining ${response._headers.get(
              'x-rate-limit-remaining',
            )}/${response._headers.get(
              'x-rate-limit-limit',
            )} requests, +${moment
              .duration(
                moment(response._headers.get('x-rate-limit-reset'), ['X']).diff(
                  moment(),
                ),
              )
              .asMilliseconds()}ms to reset`,
            `TwitterService/search/${name}`,
          );

          if (!response.statuses.length) break;

          // ascending sort
          const statuses = sortBy(response.statuses, ['id_str']);

          // new tweets counter
          let newTweets = 0;

          for await (const status of statuses) {
            const tweetedAt = moment(status.created_at, [
              'ddd MMM D HH:mm:ss ZZ YYYY',
            ]);

            const $addToSet: { [key: string]: any } = {
              tags: tag || twitterApp,
            };
            const $set: { [key: string]: any } = {
              createdAt: moment(status.user.created_at, [
                'ddd MMM D HH:mm:ss ZZ YYYY',
              ]).toDate(),
              name: status.user.screen_name,
              tweetedAt,
            };
            const $unset: { [key: string]: any } = {};

            if (status.user.followers_count)
              $set.followers = status.user.followers_count;
            else $unset.followers = true;

            if (status.user.friends_count)
              $set.friends = status.user.friends_count;
            else $unset.friends = true;

            if (status.user.favourites_count)
              $set.likes = status.user.favourites_count;
            else $unset.likes = true;

            if (status.user.listed_count) $set.lists = status.user.listed_count;
            else $unset.lists = true;

            if (status.user.statuses_count)
              $set.tweets = status.user.statuses_count;
            else $unset.tweets = true;

            const tweeter = await this.usersTable.findOne(
              { _id: status.user.id_str },
              fromPairs(this.appProps.map(i => [i, 0])),
            );

            if (tweeter && tweetedAt.isAfter(tweeter.tweetedAt)) {
              // tweet frequency per day
              $set.tweetFrequency = moment
                .duration(tweetedAt.diff(tweeter.tweetedAt))
                .asDays();

              if (
                tweeter.followers &&
                status.user.followers_count !== tweeter.followers
              )
                $set.averageFollowers =
                  (status.user.followers_count - tweeter.followers) /
                  $set.tweetFrequency;

              if (
                tweeter.friends &&
                status.user.friends_count !== tweeter.friends
              )
                $set.averageFriends =
                  (status.user.friends_count - tweeter.friends) /
                  $set.tweetFrequency;

              if (
                tweeter.likes &&
                status.user.favourites_count !== tweeter.likes
              )
                $set.averageLikes =
                  (status.user.favourites_count - tweeter.likes) /
                  $set.tweetFrequency;

              if (tweeter.lists && status.user.listed_count !== tweeter.lists)
                $set.averageLists =
                  (status.user.listed_count - tweeter.lists) /
                  $set.tweetFrequency;
            }

            await this.usersTable.updateOne(
              { _id: status.user.id_str },
              { $addToSet, $set, $unset },
              { upsert: true },
            );

            const setting = await this.settingsTable.findOne({
              _id: `${_id}|since_id`,
              value: { $gte: status.id_str },
            });

            if (!setting) {
              newTweets++;

              await this.settingsTable.updateOne(
                { _id: `${_id}|since_id` },
                { $set: { value: status.id_str } },
                { upsert: true },
              );

              // delay required for rate limiting
              let delayRequired: boolean;

              [ns].concat(ns.children || []).forEach(async ns => {
                if (
                  moment.isMoment(ns.reset) &&
                  moment(ns.reset).isAfter(moment())
                )
                  this.logger.error(
                    `skipping, +${moment
                      .duration(ns.reset.diff(moment()))
                      .asMilliseconds()}ms to reset`,
                    `${status.user.screen_name}/${status.id_str}`,
                    `TwitterService/search/${ns.executor.name}`,
                  );
                else {
                  this.logger.log(
                    `${status.user.screen_name}/${status.id_str}`,
                    `TwitterService/search/${ns.executor.name}`,
                  );

                  try {
                    await ns.execute({
                      client: ns.client,
                      executor: omit(ns.executor, this.appProps),
                      tweeter:
                        tweeter ||
                        (await this.usersTable.findOne(
                          { _id: status.user.id_str },
                          fromPairs(this.appProps.map(i => [i, 0])),
                        )),
                      status,
                    });

                    delayRequired = true;
                  } catch (e) {
                    this.logger.error(
                      e,
                      `${status.user.screen_name}/${status.id_str}`,
                      `TwitterService/search/${ns.executor.name}`,
                    );

                    if (
                      has(e, 'errors') &&
                      -1 < [185].indexOf(e.errors[0].code)
                    )
                      ns.reset = moment().add(1, 'minutes');
                  }
                }
              });

              if (delayRequired)
                await new Promise(r => setTimeout(r, 1000 * 10));
            }
          }

          if (!newTweets) break;
        }
      });

    if (
      384 * 1024 * 1024 <
      (await this.usersTable.collection.stats()).storageSize
    )
      await this.usersTable.deleteMany({
        roles: { $size: 0 },
        tweeted_at: {
          $lt: moment()
            .subtract(6, 'months')
            .toDate(),
        },
      });

    return true;
  }
}
