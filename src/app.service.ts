import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { fromPairs } from 'lodash';
import { Model } from 'mongoose';

import { appProps, model, name } from './users.table';

@Injectable()
export class AppService {
  constructor(@InjectModel(name) private readonly usersTable: Model<model>) {}

  // search route handler
  async search(query: string = '', tags: string = '') {
    const name = new RegExp(query, 'i');

    // hits
    const hits = await this.usersTable.find(
      { name, ...(tags && { tags: { $in: tags.split('|') } }) },
      fromPairs(appProps.map(i => [i, 0])),
      { limit: 10, sort: { tweetedAt: 'desc' } },
    );

    const total =
      hits.length < 10
        ? hits.length
        : await this.usersTable.countDocuments({
            name,
            ...(tags && { tags: { $in: tags.split('|') } }),
          });

    return { hits, total };
  }
}
