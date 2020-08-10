import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { has, omit } from 'lodash';
import * as moment from 'moment';
import { Model } from 'mongoose';
import { throttleTime } from 'rxjs/operators';
// import Twitter from 'twitter-lite';

import { modelTokens } from './db.models';
import { env } from './env.validations';
import { ScriptMessageService } from './script.message.service';
import { usersModel } from './users.model';

const Twitter = require('twitter-lite');

@Injectable()
export class ScriptService {
  private readonly appProps = [
    'accessRevoked',
    'accessTokenKey',
    'accessTokenSecret',
    'roles',
  ];

  constructor(
    private readonly logger: Logger,
    private readonly scriptMessageService: ScriptMessageService,
    @InjectModel(modelTokens.users)
    private readonly usersModel: Model<usersModel>,
  ) {
    const { scripts } = require('./scripts'); // import user scripts
    this.logger.log(Object.keys(scripts), 'ScriptService/scripts');

    // script executor
    this.scriptMessageService.messages
      .pipe(throttleTime(1000 * 60))
      .subscribe(async statuses => {
        if (statuses.length) {
          // clear stream
          for await (const status of statuses)
            await this.scriptMessageService.removeMessage(status);

          // get executors
          const executors = await this.usersModel.find(
            {
              accessRevoked: { $ne: true },
              accessTokenKey: { $exists: true },
              accessTokenSecret: { $exists: true },
              name: { $in: Object.keys(scripts) },
            },
            null,
            { sort: { accessTokenValidatedAt: 'desc' } },
          );

          for await (const executor of executors) {
            // twitter instance
            const client = new Twitter({
              access_token_key: executor.accessTokenKey,
              access_token_secret: executor.accessTokenSecret,
              consumer_key: env.TWITTER_CONSUMER_KEY,
              consumer_secret: env.TWITTER_CONSUMER_SECRET,
            });

            // verify credentials
            try {
              await client.get('account/verify_credentials');
            } catch (e) {
              this.logger.error(
                e,
                'account/verify_credentials',
                `ScriptService/${executor.name}`,
              );

              // accessRevoked
              await this.usersModel.updateOne(
                { _id: executor._id },
                { $set: { accessRevoked: true } },
              );

              // skip
              continue;
            }

            // executor namespace
            const ns = scripts[executor.name];

            // iterate
            for await (const status of statuses) {
              // get tweeter
              const tweeter = await this.usersModel.findOne(
                { _id: status.user.id_str },
                this.appProps.reduce(
                  (memory, value) => ({ ...memory, [value]: 0 }),
                  {},
                ),
              );

              // execution skipping conditions
              if (ns.reset && ns.reset.isAfter(moment()))
                this.logger.error(
                  `skipping, reset ${moment
                    .duration(ns.reset.diff(moment()))
                    .humanize(true)}`,
                  `${status.user.screen_name}/${status.id_str}`,
                  `ScriptService/${executor.name}`,
                );
              else {
                this.logger.log(
                  `${status.user.screen_name}/${status.id_str}`,
                  `ScriptService/${executor.name}`,
                );

                try {
                  // execute user script
                  await ns.execute({
                    client,
                    executor: omit(executor, this.appProps),
                    tweeter: tweeter,
                    status,
                  });
                } catch (e) {
                  this.logger.error(
                    e,
                    `${status.user.screen_name}/${status.id_str}`,
                    `ScriptService/${executor.name}`,
                  );

                  if (
                    has(e, 'errors') &&
                    -1 < [88, 185].indexOf(e.errors[0].code)
                  )
                    ns.reset = moment().add(3, 'minutes'); // reset in 3 minutes
                }
              }
            }
          }
        }
      });
  }
}
