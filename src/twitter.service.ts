import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import * as BigInt from 'big-integer';
import { omit, sortBy } from 'lodash';
import * as moment from 'moment';
import { Model } from 'mongoose';
// import Twitter from 'twitter-lite';

import { scripts } from './scripts';
import { model as recentModel, name as recentToken } from './recent.table';
import { searchQuery, tweetInterface } from './twitter.interface';
import {
  appProps,
  model as usersModel,
  name as usersToken,
} from './users.table';

const Twitter = require('twitter-lite');

@Injectable()
export class TwitterService {
  constructor(
    private readonly logger: Logger,
    @InjectModel(recentToken)
    private readonly recentTable: Model<recentModel>,
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
          ...(query ?? {}),
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

          // set max_id for next iteration
          requestQuery.max_id = BigInt(statuses[0].id_str)
            .subtract(1)
            .toString();

          // new tweets counter
          let newTweets = 0;

          for await (const status of statuses) {
            const tweetedAt = moment(status.created_at, [
              'ddd MMM D HH:mm:ss ZZ YYYY',
            ]);

            const $addToSet: { [key: string]: any } = {
              tags: tag ?? twitterApp,
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

            let tweeter = await this.usersTable.findOne({
              _id: status.user.id_str,
            });

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

            tweeter = await this.usersTable.findOneAndUpdate(
              { _id: status.user.id_str },
              { $addToSet, $set, $unset },
              { returnOriginal: false, upsert: true },
            );

            if (
              !(await this.recentTable.findOne({
                _id: `${_id}|${status.id_str}`,
              }))
            ) {
              newTweets++;

              await new this.recentTable({
                _id: `${_id}|${status.id_str}`,
              }).save();

              if (moment(tweeter.blockedTimeout ?? 0).isBefore(moment()))
                [ns].concat(ns.children ?? []).forEach(async ns => {
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
                      await ns.then({
                        client: ns.client,
                        executor: omit(ns.executor, appProps),
                        tweeter: omit(tweeter, appProps),
                        status,
                      });
                    } catch (e) {
                      this.logger.error(
                        e,
                        `${status.user.screen_name}/${status.id_str}`,
                        `TwitterService/search/${ns.executor.name}`,
                      );

                      if ('errors' in e)
                        switch (e.errors[0].code) {
                          case 136:
                            await this.usersTable.updateOne(
                              { _id: status.user.id_str },
                              {
                                $set: {
                                  blockedTimeout: moment()
                                    .add(90, 'days')
                                    .toDate(),
                                },
                              },
                            );
                            break;

                          case 185:
                            ns.reset = moment().add(1, 'minute');
                            break;
                        }
                    }

                    while ((ns.blocked ?? []).length)
                      await this.usersTable.updateOne(
                        { _id: ns.blocked.shift() },
                        {
                          $set: {
                            blockedTimeout: moment()
                              .add(90, 'days')
                              .toDate(),
                          },
                        },
                      );
                  }
                });
            }
          }

          if (!newTweets) break;
        }

        const limit = await this.recentTable.findOne(
          { _id: new RegExp(`^${_id}\\|`) },
          null,
          { skip: 100000, sort: { _id: 'desc' } },
        );

        if (limit)
          await this.recentTable.deleteMany({
            $and: [
              { _id: new RegExp(`^${_id}\\|`) },
              { _id: { $lte: limit._id } },
            ],
          });
      });

    if (
      384 * 1024 * 1024 <
      (await this.usersTable.collection.stats()).storageSize
    )
      await this.usersTable.deleteMany({
        roles: { $size: 0 },
        tweeted_at: {
          $lt: moment()
            .subtract(90, 'days')
            .toDate(),
        },
      });

    return true;
  }
}
