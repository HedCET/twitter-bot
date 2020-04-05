import { CACHE_MANAGER, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { each, find, pick, random } from 'lodash';
import * as moment from 'moment';
import { Model } from 'mongoose';
import { isJSON } from 'validator';

import { AmqpService } from './amqp.service';
import { modelTokens } from './db.models';
import { env } from './env.validations';
import { usersModel } from './users.model';

@Injectable()
export class WordartService {
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
    @InjectModel(modelTokens.users)
    private readonly usersModel: Model<usersModel>,
  ) {}

  // wordart route handler
  async wordart(key: string = '') {
    // custom cache handler
    let _wordart = await this.cacheManager.get('_wordart');
    if (!_wordart) _wordart = await this._wordart();

    if (key && -1 < this.WORDART_SERVICES.indexOf(key) && _wordart[key])
      return _wordart[key].wordart;
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

  // populate wordart in cache
  @Cron('0 5,15,25,35,45,55 * * * *')
  private async _wordart(key: string = '') {
    if (!key)
      for (const service of this.WORDART_SERVICES) await this._wordart(service);

    if (-1 < this.WORDART_SERVICES.indexOf(key)) {
      const data = { startAt: moment().toDate(), tweeters: [], wordart: {} };

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
          this.logger.error(e, e.message, `WordartService/${key}`);
        }

        if (content) {
          if (isJSON(content)) {
            const json = JSON.parse(content);

            this.logger.log(
              pick(json, ['statusCode', 'statusText']),
              `WordartService/${key}`,
            );

            if (json.statusCode == 200) {
              data.wordart = json.response;

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
              `WordartService/${key}`,
            );
        }
      }
    }

    return (await this.cacheManager.get('_wordart')) || {};
  }
}
