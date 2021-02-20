import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { model as recentModel, name as recentToken } from './recent.table';
import {
  appProps,
  model as usersModel,
  name as usersToken,
} from './users.table';

@Injectable()
export class AppService {
  constructor(
    @InjectModel(recentToken) private readonly recentTable: Model<recentModel>,
    @InjectModel(usersToken) private readonly usersTable: Model<usersModel>,
  ) {}

  // search route handler
  async search(query: string = '', tags: string = '') {
    const name = new RegExp(query, 'i');

    // hits
    const hits = await this.usersTable.find(
      { name, ...(tags && { tags: { $in: tags.split('|') } }) },
      (appProps ?? []).reduce((m, i) => ({ ...m, [i]: 0 }), {}),
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

  // recent route handler
  async recent() {
    return await this.recentTable.find(
      { text: { $exists: true } },
      {},
      { limit: 1000, sort: { _id: 'asc' } },
    );
  }
}
