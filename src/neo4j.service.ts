import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { Driver, session, Result } from 'neo4j-driver';

import { env } from './env.validations';

@Injectable()
export class Neo4jService implements OnApplicationShutdown {
  constructor(@Inject('NEO4J') private readonly driver: Driver) {}

  async onApplicationShutdown() {
    await this.driver.close();
  }

  getReadSession(dbName?: string) {
    return this.driver.session({
      database: dbName || env.NEO4J_DB_NAME,
      defaultAccessMode: session.READ,
    });
  }

  read(query: string, params?: object, dbName?: string): Result {
    return this.getReadSession(dbName).run(query, params);
  }

  getWriteSession(dbName?: string) {
    return this.driver.session({
      database: dbName || env.NEO4J_DB_NAME,
      defaultAccessMode: session.WRITE,
    });
  }

  write(query: string, params?: object, dbName?: string): Result {
    return this.getWriteSession(dbName).run(query, params);
  }
}
