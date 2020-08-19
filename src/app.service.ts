import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { model, name } from './users.table';

@Injectable()
export class AppService {
  constructor(@InjectModel(name) private readonly usersTable: Model<model>) {}

  // search route handler
  async search(query: string = '', tags: string = '') {
    const name = new RegExp(query, 'i');

    const hits = await this.usersTable.find(
      { name, tags: { $in: tags.split('|') } },
      { name: 1 },
      { limit: 10, sort: { tweetedAt: 'desc' } },
    );

    return {
      hits: hits.map(hit => hit.name),
      total:
        hits.length < 10
          ? hits.length
          : await this.usersTable.countDocuments({
              name,
              tags: { $in: tags.split('|') },
            }),
    };
  }
}
